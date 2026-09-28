import { Canvas, ActiveSelection, FabricImage, Rect, Textbox, Path, Polygon, PencilBrush, Group, filters } from 'fabric';
import { UIComponent } from '../core/UIComponent.js';
import { api } from '../services/api.js';
import { toast } from './Toast.js';
import { confirmDialog } from './ConfirmDialog.js';
import { subscribeToAlbum } from '../services/pusher.js';
import {
  BRUSHES, FONTS, FONT_CATEGORIES, FRAMES, INK_COLORS, PAGE_BACKGROUNDS, PALETTES,
  PEN_COLORS, PHOTO_FILTERS, SHAPE_FILL, SHAPE_INK, SHAPES, STICKERS, BORDER_STYLES,
  backgroundDefinition, brushDefinition, buildSticker, clampSides, frameDefinition,
  hashString, seededRandom, shapeDefinition, shapeSvg, stickerColors,
  stickerDefinition, stickerSvg,
} from './scrapbook/geometry.js';

/** How a text box's border is drawn. See `applyTextBorder`. */
const TEXT_BORDERS = [
  { id: 'none', label: 'None', hint: 'No border' },
  { id: 'glyph', label: 'Letters', hint: 'Outline each character' },
  { id: 'box', label: 'Box', hint: 'A box around the whole text' },
  { id: 'both', label: 'Both', hint: 'Letters and a box' },
];

/**
 * Icon per brush, so the picker reads as tools rather than as eight labels.
 * Every name here is checked against this build's icon set - `crayon` was not in
 * it, so the crayon brush rendered with no icon at all and lucide logged a
 * warning for it on every panel paint.
 */
const BRUSH_ICONS = {
  pen: 'pen-line',
  marker: 'highlighter',
  brush: 'brush',
  crayon: 'pencil',
  calligraphy: 'feather',
  spray: 'spray-can',
  highlighter: 'highlighter',
  eraser: 'eraser',
};

/** Backs `layerHandle()`. Module-level so two workspaces cannot collide. */
let layerHandleSeed = 0;

/** Attributes and text both go through here: captions and titles are user input. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

/**
 * Trace a closed rectangle with a ragged bite taken out of all four sides.
 *
 * Notches scale with the object and bite inward from every side, so the tear is
 * legible on a thumbnail and on a full-size export alike. The amplitude is
 * capped so a very large photo tears at the edge instead of dissolving.
 */
function buildTornPath(width, height, seed) {
  const random = seededRandom(seed);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  // Capped so a very large photo tears at the edge instead of dissolving.
  const amplitude = Math.max(3, Math.min(Math.min(width, height) * 0.05, 26));
  const points = [];

  const edge = (ax, ay, bx, by, nx, ny) => {
    points.push({ x: ax, y: ay });
    const length = Math.hypot(bx - ax, by - ay);
    // Roughly square notches whatever the object's aspect ratio.
    const notches = Math.max(3, Math.min(16, Math.round(length / (amplitude * 1.7))));
    for (let index = 1; index < notches; index += 1) {
      const t = index / notches;
      const depth = amplitude * (0.4 + 0.6 * random());
      points.push({
        x: ax + (bx - ax) * t + nx * depth,
        y: ay + (by - ay) * t + ny * depth,
      });
    }
    points.push({ x: bx, y: by });
  };

  // Inward normals: top bites down, right bites left, bottom bites up, left bites right.
  edge(-halfWidth, -halfHeight, halfWidth, -halfHeight, 0, 1);
  edge(halfWidth, -halfHeight, halfWidth, halfHeight, -1, 0);
  edge(halfWidth, halfHeight, -halfWidth, halfHeight, 0, -1);
  edge(-halfWidth, halfHeight, -halfWidth, -halfHeight, 1, 0);

  return new Polygon(points, { originX: 'center', originY: 'center' });
}

export class ScrapbookWorkspace extends UIComponent {
  constructor(props) {
    super(props);
    this.albumId = props.albumId;
    this.photos = props.photos || [];
    this.pages = [];
    this.activePage = null;
    this.canvas = null;
    this.isLoading = true;
    this.isSaving = false;
    this.selectedPhotoIds = new Set();
    this.saveTimer = null;
    this.isDrawing = false;
    this._fetched = false;
    this.history = [];
    this.historyIndex = -1;
    this.isApplyingHistory = false;
    this.unsubscribePusher = null;
    this.hasUnsavedChanges = false;
    this.saveQueued = false;
    this.conflictRetries = 0;
    this.editorMode = 'select';
    this.doodleColor = '#c85a32';
    this.brush = 'pen';
    this.brushWidthOverride = 0;
    // Which inspector tab is open. The old layout showed every control group at
    // once in one wrapping row, which is what made the editor feel cramped.
    this.inspectorTab = 'insert';
    // View state. Zoom is user-controlled, so it survives tab switches rather
    // than snapping back to fit every time the page is re-mounted.
    this.zoom = null;
    this.zoomPercent = 100;
    this.isFullscreen = false;
    // The font picker is a custom menu rather than a <select>, because a native
    // select cannot render each option in its own typeface - which is the whole
    // point of a scrapbook font menu.
    this.fontMenuOpen = false;
    this.colorPickerTarget = null;
    this.isPanning = false;
    this.panOrigin = null;
    this.isCreating = false;
    // True only while `mountCanvas` is rebuilding the page. The canvas object
    // exists during that window but is still empty, so a save timer landing
    // here would PUT an empty element list and wipe the page.
    this.isHydrating = false;
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    this.handleDocumentPointerDown = this.handleDocumentPointerDown.bind(this);
  }

  /**
   * Dismiss the font menu on any click outside it.
   *
   * Uses pointerdown rather than click so the menu closes before the click
   * lands, which stops a click on the canvas behind the menu from also
   * selecting whatever was under the pointer.
   */
  handleDocumentPointerDown(event) {
    if (!this.fontMenuOpen) return;
    if (event.target?.closest?.('.scrapbook-font-menu')) return;
    this.fontMenuOpen = false;
    this.refreshInspector();
  }

  async onMount() {
    this.delegate('click', '.btn-create-scrapbook', () => this.createPage());
    this.delegate('click', '.btn-select-scrapbook', (event, target) => this.selectPage(target.dataset.pageId));
    this.delegate('click', '.btn-delete-scrapbook', () => this.deletePage());
    this.delegate('click', '.btn-toggle-scrapbook-lock', () => this.toggleLock());
    this.delegate('click', '.btn-save-scrapbook-title', () => this.saveTitle());
    this.delegate('click', '.btn-add-selected-photos', () => this.addSelectedPhotos());
    this.delegate('change', '.scrapbook-photo-picker', (event, target) => this.togglePhoto(target));
    this.delegate('click', '.btn-add-text', () => this.addText());
    this.delegate('click', '.btn-add-shape', (event, target) => this.addShape(target.dataset.shape));
    this.delegate('click', '.btn-add-sticker', (event, target) => this.addSticker(target.dataset.sticker));
    this.delegate('click', '.scrapbook-inspector-tab', (event, target) => this.setInspectorTab(target.dataset.inspectorTab));
    this.delegate('click', '[data-goto-tab]', (event, target) => this.setInspectorTab(target.dataset.gotoTab));
    // The font menu is a real listbox: clicking the trigger opens it, clicking
    // an option applies and closes, and Escape or an outside click dismisses.
    this.delegate('click', '.scrapbook-font-trigger', () => this.toggleFontMenu());
    this.delegate('click', '.scrapbook-font-option', (event, target) => {
      this.fontMenuOpen = false;
      this.applyTextStyle({ fontFamily: target.dataset.fontFamily });
    });
    this.delegate('keydown', '.scrapbook-font-trigger', (event) => {
      if (event.key === 'Escape') { this.fontMenuOpen = false; this.refreshInspector(); }
    });
    this.delegate('click', '.btn-text-weight', (event, target) => this.applyTextStyle({ fontWeight: Number(target.dataset.fontWeight) }));
    this.delegate('click', '.btn-text-style', () => {
      const selection = this.getSelectedText();
      this.applyTextStyle({ fontStyle: selection?.fontStyle === 'italic' ? 'normal' : 'italic' });
    });
    this.delegate('click', '.btn-text-align', (event, target) => this.applyTextStyle({ textAlign: target.dataset.textAlign }));
    this.delegate('click', '.btn-text-color', (event, target) => this.applyTextColor(target.dataset.textColor));
    this.delegate('change', '[data-text-prop]', (event, target) => {
      const value = Number(target.value);
      if (Number.isFinite(value)) this.applyTextStyle({ [target.dataset.textProp]: value });
    });
    this.delegate('change', '[data-text-color-input]', (event, target) => this.applyTextColor(target.value));
    // One swatch row per colour a sticker actually has. The slot index travels
    // with the control, so the panel does not need a button per colour.
    this.delegate('click', '.btn-sticker-color', (event, target) => this.recolourStickerSlot(target.dataset.stickerSlot, target.dataset.stickerColor));
    this.delegate('change', '[data-sticker-color-input]', (event, target) => this.recolourStickerSlot(target.dataset.stickerSlot, target.value));
    this.delegate('click', '.btn-apply-fill', (event, target) => this.applyFill(target.dataset.fillColor, { slot: target.dataset.slot }));
    this.delegate('change', '[data-fill-color-input]', (event, target) => this.applyFill(target.value, { slot: target.dataset.slot }));
    this.delegate('click', '.btn-text-border', (event, target) => this.setTextBorderMode(target.dataset.textBorder));
    this.delegate('click', '.btn-toggle-border', () => this.toggleBorder());
    this.delegate('change', '[data-shape-sides]', (event, target) => this.setShapeSides(target.value));
    this.delegate('change', '[data-doodle-color-input]', (event, target) => this.setDoodleColor(target.value));
    this.delegate('click', '.btn-apply-background', (event, target) => this.applyBackground(target.dataset.background));
    this.delegate('click', '.btn-toggle-drawing', () => this.toggleDrawing());
    this.delegate('click', '.btn-editor-mode', (event, target) => this.setEditorMode(target.dataset.mode));
    this.delegate('click', '.btn-doodle-color', (event, target) => this.setDoodleColor(target.dataset.color));
    this.delegate('click', '.btn-pick-brush', (event, target) => this.setBrush(target.dataset.brush));
    this.delegate('change', '[data-brush-width]', (event, target) => this.setBrushWidth(Number(target.value)));
    this.delegate('click', '.btn-apply-filter', (event, target) => this.applyFilter(target.dataset.filter));
    this.delegate('click', '.btn-apply-frame', (event, target) => this.applyFrame(target.dataset.frame));
    this.delegate('click', '.btn-border-style', (event, target) => this.applyBorder({ style: target.dataset.borderStyle }));
    this.delegate('click', '.btn-border-color', (event, target) => this.applyBorder({ color: target.dataset.borderColor }));
    this.delegate('change', '[data-border-color-input]', (event, target) => this.applyBorder({ color: target.value }));
    this.delegate('change', '[data-border-width]', (event, target) => this.applyBorder({ width: Number(target.value) }));
    this.delegate('change', '[data-border-radius]', (event, target) => this.applyBorder({ radius: Number(target.value) }));
    this.delegate('change', '[data-border-box-padding]', (event, target) => this.applyBorder({ boxPadding: Number(target.value) }));
    this.delegate('click', '.btn-toggle-sticker-rim', () => this.toggleStickerRim());
    this.delegate('change', '[data-sticker-rim-width]', (event, target) => this.applyStickerRim({ width: Number(target.value) }));
    this.delegate('change', '[data-sticker-rim-color]', (event, target) => this.applyStickerRim({ color: target.value }));
    this.delegate('change', '[data-sticker-rim-style]', (event, target) => this.applyStickerRim({ style: target.dataset.borderStyle }));
    this.delegate('click', '.btn-apply-torn', () => this.applyTornEdge());
    this.delegate('click', '.btn-duplicate-element', () => this.duplicateSelected());
    this.delegate('click', '.btn-delete-element', () => this.deleteSelected());
    this.delegate('click', '.btn-move-layer', (event, target) => this.moveLayer(target.dataset.direction));
    this.delegate('click', '.btn-layer-visibility', (event, target) => this.toggleLayerVisibility(target.dataset.layerId));
    this.delegate('click', '.btn-layer-lock', (event, target) => this.toggleLayerLock(target.dataset.layerId));
    this.delegate('click', '.btn-layer-select', (event, target) => this.selectLayer(target.dataset.layerId));
    this.delegate('click', '.btn-layer-delete', (event, target) => this.deleteLayer(target.dataset.layerId));
    this.delegate('click', '.btn-layer-up', (event, target) => this.reorderLayer(target.dataset.layerId, 'up'));
    this.delegate('click', '.btn-layer-down', (event, target) => this.reorderLayer(target.dataset.layerId, 'down'));
    this.delegate('click', '.btn-zoom-in', () => this.zoomBy(0.1));
    this.delegate('click', '.btn-zoom-out', () => this.zoomBy(-0.1));
    this.delegate('click', '.btn-zoom-fit', () => this.setZoom(null));
    this.delegate('click', '.btn-zoom-reset', () => this.setZoom(1));
    this.delegate('click', '.btn-toggle-fullscreen', () => this.toggleFullscreen());
    this.delegate('click', '.btn-export', (event, target) => this.exportAs(target.dataset.export));
    this.delegate('click', '.btn-undo-element', () => this.undo());
    this.delegate('click', '.btn-redo-element', () => this.redo());
    this.delegate('click', '.btn-toggle-element-lock', () => this.toggleElementLock());
    this.delegate('click', '.btn-group-elements', () => this.groupSelected());
    this.delegate('click', '.btn-ungroup-elements', () => this.ungroupSelected());
    this.on(document, 'keydown', this.handleKeyDown);
    this.on(window, 'beforeunload', this.handleBeforeUnload);
    this.on(document, 'pointerdown', this.handleDocumentPointerDown, true);
    this.on(document, 'fullscreenchange', () => this.syncFullscreenState());

    if (!this.unsubscribePusher) {
      this.unsubscribePusher = subscribeToAlbum(this.albumId, {
        onScrapbookCreated: (data) => {
          if (data.scrapbook && !this.pages.some((page) => page.id === data.scrapbook.id)) {
            this.pages = [...this.pages, { ...data.scrapbook, elements: [] }];
            this.update();
          }
        },
        onScrapbookUpdated: (data) => this.handleRemoteRevision(data),
        onScrapbookDeleted: (data) => {
          this.pages = this.pages.filter((page) => page.id !== data.scrapbookId);
          if (this.activePage?.id === data.scrapbookId) {
            this.activePage = this.pages[0] || null;
            this.update();
            if (this.activePage) this.selectPage(this.activePage.id);
          } else {
            this.update();
          }
        },
        onScrapbookLockChanged: (data) => {
          this.pages = this.pages.map((page) => page.id === data.scrapbookId ? { ...page, isLocked: data.isLocked } : page);
          if (this.activePage?.id === data.scrapbookId) {
            this.activePage = { ...this.activePage, isLocked: data.isLocked };
            this.update();
            this.mountCanvas();
          }
        },
      });
    }

    if (!this._fetched) {
      this._fetched = true;
      await this.loadPages();
    }
  }

  onUnmount() {
    this._fetched = false;
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.canvas?.dispose();
    this.unsubscribePusher?.();
    this.unsubscribePusher = null;
  }

  handleBeforeUnload(event) {
    if (!this.hasUnsavedChanges) return;
    event.preventDefault();
    event.returnValue = '';
  }

  handleKeyDown(event) {
    if (!this.canvas || this.activePage?.isLocked) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? this.redo() : this.undo();
    } else if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.deleteSelected();
    }
  }

  async loadPages() {
    try {
      this.pages = await api.get(`/scrapbooks/album/${this.albumId}`);
      if (this.pages.length > 0) {
        await this.selectPage(this.pages[0].id);
      } else {
        this.isLoading = false;
        this.update();
      }
    } catch (err) {
      this.isLoading = false;
      toast.error(`Could not load scrapbooks: ${err.message}`);
      this.update();
    }
  }

  async createPage() {
    // Two guards. `isCreating` stops a double-click firing two POSTs, and the
    // `some()` check handles the subtler race: the `scrapbook:created`
    // broadcast for our own POST reaches us over Pusher before the HTTP
    // response does, and that handler has already appended the page by then.
    // Pushing unconditionally listed the same page twice.
    if (this.isCreating || this.activePage?.isLocked) return;
    this.isCreating = true;
    try {
      const page = await api.post(`/scrapbooks/album/${this.albumId}`, { title: this.nextPageTitle() });
      if (!this.pages.some((existing) => existing.id === page.id)) {
        this.pages = [...this.pages, page];
        this.update();
      }
      await this.selectPage(page.id);
      toast.success('New scrapbook page created.');
    } catch (err) {
      toast.error(`Could not create scrapbook: ${err.message}`);
    } finally {
      this.isCreating = false;
    }
  }

  /**
   * The next unused "Scrapbook N" name.
   *
   * Derived from the numbers already in use, not from `pages.length + 1`:
   * with pages 1, 2 and 4, the count is 3, so the old expression proposed
   * "Scrapbook 3" - a name that is free, but leaves a gap that reads like a
   * missing page, and with pages 1 and 3 it proposed "Scrapbook 3", a straight
   * duplicate. Taking the lowest free number keeps the sequence contiguous and
   * never collides.
   */
  nextPageTitle() {
    const used = new Set(
      this.pages
        .map((page) => /^Scrapbook (\d+)$/.exec(page.title || ''))
        .filter(Boolean)
        .map((match) => Number(match[1])),
    );
    let next = 1;
    while (used.has(next)) next += 1;
    return `Scrapbook ${next}`;
  }

  async selectPage(pageId) {
    this.activePage = this.pages.find((page) => page.id === pageId) || null;
    if (!this.activePage) return;

    try {
      this.isLoading = true;
      this.update();
      this.activePage = await api.get(`/scrapbooks/${pageId}`);
      this.pages = this.pages.map((page) => page.id === pageId ? this.activePage : page);
      this.isLoading = false;
      this.update();
      await this.mountCanvas();
    } catch (err) {
      this.isLoading = false;
      toast.error(`Could not load scrapbook: ${err.message}`);
      this.update();
    }
  }

  async mountCanvas() {
    const canvasElement = this.$('#scrapbook-canvas');
    if (!canvasElement || !this.activePage) return;
    // Drop any save that was queued for the outgoing canvas. It was queued
    // against elements that are about to be replaced, and its timer can fire
    // after the new (still empty) canvas exists.
    window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.isHydrating = true;
    this.canvas?.dispose();

    this.canvas = new Canvas(canvasElement, {
      width: this.activePage.canvasWidth || 1200,
      height: this.activePage.canvasHeight || 800,
      selection: !this.activePage.isLocked,
      preserveObjectStacking: true,
    });
    this.canvas.wrapperEl.classList.add('scrapbook-fabric-wrapper');
    this.canvas.wrapperEl.classList.add('editor-mode-select');
    if (this.activePage.isLocked) {
      this.setLockedCanvasState(true);
    } else {
      this.setEditorMode(this.editorMode);
    }
    this.canvas.on('object:modified', () => this.recordHistory());
    this.canvas.on('object:added', ({ target }) => {
      if (target) this.applySelectionStyle(target);
      this.recordHistory();
    });
    this.canvas.on('object:removed', () => this.recordHistory());
    this.canvas.on('path:created', ({ path }) => {
      path.elementType = 'doodle';
      path.doodleColor = this.doodleColor;
      path.brush = this.brush;
      this.decorateDoodle(path);
      this.recordHistory();
    });
    this.canvas.on('mouse:down', (event) => this.handleCanvasMouseDown(event));
    this.canvas.on('mouse:move', (event) => this.handleCanvasMouseMove(event));
    this.canvas.on('mouse:up', () => this.handleCanvasMouseUp());
    this.canvas.on('selection:created', () => this.updateSelectionControls());
    this.canvas.on('selection:updated', () => this.updateSelectionControls());
    this.canvas.on('selection:cleared', () => this.updateSelectionControls());

    // `finally`, not a plain reset: a single element that fails to build (a dead
    // image URL, say) must not leave `isHydrating` latched on and silently
    // block every future save.
    this.isApplyingHistory = true;
    try {
      for (const element of this.activePage.elements || []) {
        await this.restoreElement(element);
      }
    } finally {
      this.isApplyingHistory = false;
      this.isHydrating = false;
    }
    this.history = [];
    this.historyIndex = -1;
    this.hasUnsavedChanges = false;
    // Seed the undo baseline directly instead of going through
    // recordHistory(), which ends in scheduleSave(). Opening a page used to
    // PUT its own unchanged content back, bumping the revision and pushing a
    // scrapbook:updated broadcast to every other member for no reason.
    this.history = [this.serializeCanvas()];
    this.historyIndex = 0;
    this.updateHistoryButtons();
    this.canvas.requestRenderAll();
    this.fitCanvas();
    this.updateSelectionControls();
  }

  setLockedCanvasState(isLocked) {
    if (!this.canvas) return;
    this.canvas.isDrawingMode = false;
    this.canvas.selection = false;
    this.canvas.skipTargetFind = true;
    this.canvas.discardActiveObject();
    this.canvas.setCursor('default');
    this.canvas.wrapperEl.classList.toggle('is-canvas-locked', isLocked);
    this.$('.scrapbook-canvas-stage')?.classList.toggle('is-canvas-locked', isLocked);
  }

  async restoreElement(element) {
    const object = await this.buildFabricObject(element);
    if (object) this.canvas.add(object);
  }

  async buildFabricObject(element) {
    const properties = this.safeFabricProperties(element.properties || {});
    if (element.type === 'photo' && properties.src) {
      const matchingPhoto = this.photos.find((photo) => photo.id === element.photoId || photo.r2Url === properties.src);
      const image = await this.loadPhotoImage(matchingPhoto?.id || element.photoId, properties.src);
      image.set({ ...properties, photoId: element.photoId, elementType: 'photo', locked: element.locked });
      this.applyObjectLock(image, element.locked);
      if (properties.filterStyle) this.applyFilterToObject(image, properties.filterStyle);
      // An object has one clipPath, so a frame and a torn edge cannot both be
      // saved; the frame wins, because it is the one that was chosen last by the
      // only writer that sets both (applyTornToObject clears the frame).
      if (properties.frame && properties.frame !== 'none') this.applyFrameToObject(image, properties.frame);
      else if (properties.clipStyle === 'torn') this.applyTornToObject(image);
      this.applyBorderToObject(image, this.savedBorderPatch(properties));
      this.applyVisibility(image, element);
      return image;
    }
    if (element.type === 'text') {
      const text = new Textbox(properties.text || 'Your memory', { ...properties, elementType: 'text', locked: element.locked });
      // A text box's border is a mode, not just a stroke, so it is replayed
      // through the mode-aware path or the box half is lost.
      if (properties.borderMode) this.applyTextBorderToObject(text, this.savedBorderPatch(properties));
      else this.applyBorderToObject(text, this.savedBorderPatch(properties));
      this.applyObjectLock(text, element.locked);
      this.applyVisibility(text, element);
      return text;
    }
    if (element.type === 'sticker') {
      // Pages saved before the die-cut set have no stickerId: those stickers
      // are emoji Textboxes and must keep rendering as text, or existing
      // scrapbooks lose their stickers on next open.
      if (properties.stickerId) {
        // Pages saved before the slot model stored two flat fields; they are
        // folded into the first two slots so old scrapbooks recolour as before.
        const legacy = [];
        if (properties.fill) legacy[0] = properties.fill;
        if (properties.accentColor) legacy[1] = properties.accentColor;
        const colors = properties.stickerColors || (legacy.length ? legacy : null);
        const sticker = buildSticker(properties.stickerId, {
          colors,
          rim: this.rimSpecFor(properties),
        });
        const { width, height, stickerColors: _slotField, ...placement } = properties;
        sticker.set({ ...placement, elementType: 'sticker', stickerId: properties.stickerId, locked: element.locked });
        // The rim and the colours arrive with the vector, but a sticker that was
        // hidden or locked still has to be rebuilt as such.
        sticker.stickerRim = properties.rim ?? false;
        sticker.stickerColors = stickerColors(stickerDefinition(properties.stickerId), colors).colors;
        this.applyObjectLock(sticker, element.locked);
        this.applyVisibility(sticker, element);
        return sticker;
      }
      const legacySticker = new Textbox(properties.text || '🫶', {
        ...properties, fontSize: properties.fontSize || 54, elementType: 'sticker', locked: element.locked,
      });
      this.applyObjectLock(legacySticker, element.locked);
      this.applyVisibility(legacySticker, element);
      return legacySticker;
    }
    if (element.type === 'shape') {
      // Rebuild from the catalogue so a hexagon comes back a hexagon. Pages
      // saved before shapes had variety carry no shapeId and stay rectangles.
      //
      // The saved width/height are only replayed when the catalogue shape has
      // no intrinsic size. Every shape but a rect derives its own from a radius
      // or a point list, so passing the saved numbers back would stretch a star
      // to a stale aspect ratio; a rect has no size of its own, so dropping
      // them would collapse it to nothing.
      const { width, height, ...placement } = properties;
      const definition = shapeDefinition(properties.shapeId);
      const shape = definition.build({ sides: properties.shapeSides });
      const size = {
        ...(shape.width ? { width } : {}),
        ...(shape.height ? { height } : {}),
      };
      shape.set({ ...placement, ...size, elementType: 'shape', shapeId: properties.shapeId || 'rect', locked: element.locked });
      // A shape restored with `fill` from the saved properties already has its
      // colour; this only fills in the outline shapes, which need a stroke.
      this.applyShapePaint(shape, definition);
      if (properties.shapeSides) shape.shapeSides = properties.shapeSides;
      this.applyBorderToObject(shape, this.savedBorderPatch(properties));
      this.applyObjectLock(shape, element.locked);
      this.applyVisibility(shape, element);
      return shape;
    }
    if (element.type === 'doodle' && properties.path) {
      const doodle = new Path(properties.path, { ...properties, elementType: 'doodle', locked: element.locked });
      doodle.doodleColor = properties.doodleColor || properties.stroke || this.doodleColor;
      doodle.brush = properties.brush || 'pen';
      this.applyObjectLock(doodle, element.locked);
      this.applyVisibility(doodle, element);
      return doodle;
    }
    if (element.type === 'group' && Array.isArray(properties.objects)) {
      const children = [];
      for (const child of properties.objects) {
        const object = await this.buildFabricObject(child);
        if (object) children.push(object);
      }
      const group = new Group(children, this.safeFabricProperties(properties));
      group.elementType = 'group';
      group.subTargetCheck = false;
      this.applyObjectLock(group, element.locked);
      this.applyVisibility(group, element);
      return group;
    }
    return null;
  }

  scheduleSave() {
    if (!this.activePage || this.activePage.isLocked) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveCanvas(), 700);
  }

  serializeCanvas() {
    return JSON.stringify(this.getCanvasElements());
  }

  safeFabricProperties(properties) {
    const {
      type, version, elementType, photoId, clipPath, filters: serializedFilters,
      ...safeProperties
    } = properties;
    return safeProperties;
  }

  getCanvasElements() {
    if (!this.canvas) return [];
    // Only real fabric objects are persisted. A stray value (a number, say)
    // serialises to a property-less "shape" that reloads as an empty rectangle
    // and quietly corrupts the page, so it is dropped here instead.
    return this.canvas
      .getObjects()
      .filter((object) => object && typeof object.toObject === 'function')
      .map((object, index) => this.serializeObject(object, index));
  }

  serializeObject(object, index = 0) {
    const type = object.elementType || (object.path ? 'doodle' : 'shape');
    const properties = {
      left: object.left,
      top: object.top,
      scaleX: object.scaleX,
      scaleY: object.scaleY,
      angle: object.angle,
      width: object.width,
      height: object.height,
      fill: object.fill,
      fontSize: object.fontSize,
      fontFamily: object.fontFamily,
      // Typography beyond size and face. These used to be left out here, which
      // meant weight, slant, alignment, leading and tracking applied live and
      // then quietly reverted on the next reload.
      fontWeight: object.fontWeight,
      fontStyle: object.fontStyle,
      textAlign: object.textAlign,
      lineHeight: object.lineHeight,
      charSpacing: object.charSpacing,
      text: object.text,
      src: object.src,
      opacity: object.opacity,
      // Hidden is a property of the element, not of the session: a layer the
      // author hid should still be hidden after a reload, and should still be
      // saved so it can be found and un-hidden in the Layers tab.
      visible: object.visible !== false,
      flipX: object.flipX,
      flipY: object.flipY,
      path: object.path,
      stroke: object.stroke,
      strokeWidth: object.strokeWidth,
      strokeDashArray: object.strokeDashArray || null,
      rx: object.rx ?? null,
      ry: object.ry ?? null,
      // A frame is a clip path now, so only the id is worth saving - the
      // outline is rebuilt against the photo's own box on the way back in.
      frame: object.frame || null,
      // The panel's border model is these numbers, not the fabric stroke alone:
      // the weight the author typed is what the control has to show again, a
      // "double" border is a doubled stroke that cannot be inferred from
      // strokeWidth, and an off border is indistinguishable from an unset one
      // without its own flag.
      borderWidth: object.borderWidth ?? null,
      borderColor: object.borderColor || null,
      borderStyle: object.borderStyle || null,
      borderRadius: object.borderRadius ?? null,
      borderOn: object.borderOn === true,
      doubleBorder: object.doubleBorder === true,
      strokeUniform: object.strokeUniform === true,
      // A text border has two halves - an outline on the glyphs and a box round
      // the block - and either can be on alone. Saving only the stroke lost the
      // box, and left the panel unable to say which of the two it was editing.
      borderMode: object.borderMode || null,
      boxColor: object.boxColor || null,
      boxPadding: object.boxPadding ?? null,
      // An outline shape (the line) paints with its stroke, not its fill, and
      // forgetting that turned it invisible on reload.
      paintAsStroke: object.paintAsStroke === true,
      filterStyle: object.filterStyle,
      clipStyle: object.clipStyle,
      doodleColor: object.doodleColor,
      brush: object.brush || null,
      shapeId: object.shapeId || null,
      shapeSides: object.shapeSides ?? null,
    };
    if (type === 'group') properties.objects = object.getObjects().map((child, childIndex) => this.serializeObject(child, childIndex));
    if (type === 'sticker') {
      // Only the id, the colour slots and the rim are stored - the vector is
      // rebuilt from them, so the sticker catalogue can grow without touching
      // saved pages.
      properties.stickerId = object.stickerId || null;
      properties.stickerColors = Array.isArray(object.stickerColors) ? object.stickerColors : null;
      // The die-cut rim is opt-in, and when it is on its width/colour/style are
      // the same numbers the Border panel edits for every other object.
      properties.rim = object.stickerRim ?? false;
    }
    return {
      type,
      photoId: object.photoId || null,
      zIndex: index,
      locked: object.locked === true,
      properties,
    };
  }

  getSelectedObjects() {
    const active = this.canvas?.getActiveObject();
    if (!active) return [];
    return typeof active.getObjects === 'function' && active.type !== 'group'
      ? active.getObjects()
      : [active];
  }

  discardSelection() {
    this.canvas?.discardActiveObject();
    this.canvas?.requestRenderAll();
  }

  groupSelected() {
    const active = this.canvas?.getActiveObject();
    const objects = this.getSelectedObjects();
    if (!active || objects.length < 2 || this.activePage?.isLocked) return;
    this.canvas.discardActiveObject();
    this.canvas.remove(...objects);
    const group = new Group(objects, { subTargetCheck: false });
    group.elementType = 'group';
    this.applySelectionStyle(group);
    this.canvas.add(group);
    this.canvas.setActiveObject(group);
    this.updateSelectionControls();
    this.recordHistory();
  }

  ungroupSelected() {
    const active = this.canvas?.getActiveObject();
    if (!active || active.type !== 'group' || this.activePage?.isLocked) return;
    const objects = active.getObjects();
    this.canvas.discardActiveObject();
    this.canvas.remove(active);
    objects.forEach((object) => {
      object.group = undefined;
      this.canvas.add(object);
    });
    const selection = new ActiveSelection(objects, { canvas: this.canvas });
    this.canvas.setActiveObject(selection);
    this.updateSelectionControls();
    this.recordHistory();
  }

  toggleElementLock() {
    const objects = this.getSelectedObjects();
    if (!objects.length || this.activePage?.isLocked) return;
    const lockableObjects = objects.flatMap((object) => this.getLockableObjects(object));
    const shouldLock = lockableObjects.some((object) => !object.locked);
    lockableObjects.forEach((object) => this.applyObjectLock(object, shouldLock));
    this.canvas.requestRenderAll();
    this.updateSelectionControls();
    this.recordHistory();
  }

  getLockableObjects(object) {
    if (object.type === 'group') return [object, ...object.getObjects().flatMap((child) => this.getLockableObjects(child))];
    return [object];
  }

  deleteSelected() {
    const objects = this.getSelectedObjects();
    if (!objects.length || this.activePage?.isLocked) return;
    this.discardSelection();
    objects.forEach((object) => {
      if (object.canvas === this.canvas) this.canvas.remove(object);
    });
    this.recordHistory();
  }

  recordHistory() {
    if (!this.canvas || this.isApplyingHistory || this.activePage?.isLocked) return;
    const snapshot = this.serializeCanvas();
    if (snapshot === this.history[this.historyIndex]) return;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot);
    this.historyIndex = this.history.length - 1;
    this.hasUnsavedChanges = this.historyIndex > 0;
    this.updateHistoryButtons();
    this.scheduleSave();
  }

  async restoreSnapshot(snapshot) {
    if (!this.canvas || !snapshot) return;
    this.isApplyingHistory = true;
    this.canvas.clear();
    for (const element of JSON.parse(snapshot)) {
      await this.restoreElement(element);
    }
    this.isApplyingHistory = false;
    this.canvas.requestRenderAll();
    this.updateHistoryButtons();
    this.scheduleSave();
  }

  async undo() {
    if (this.historyIndex <= 0 || this.activePage?.isLocked) return;
    this.historyIndex -= 1;
    await this.restoreSnapshot(this.history[this.historyIndex]);
  }

  async redo() {
    if (this.historyIndex >= this.history.length - 1 || this.activePage?.isLocked) return;
    this.historyIndex += 1;
    await this.restoreSnapshot(this.history[this.historyIndex]);
  }

  updateHistoryButtons() {
    const undo = this.$('.btn-undo-element');
    const redo = this.$('.btn-redo-element');
    if (undo) undo.disabled = this.historyIndex <= 0 || this.activePage?.isLocked;
    if (redo) redo.disabled = this.historyIndex >= this.history.length - 1 || this.activePage?.isLocked;
  }

  async saveCanvas() {
    if (!this.canvas || !this.activePage || this.activePage.isLocked) return;
    // Mid-hydration the canvas exists but holds none of the page's elements
    // yet. Serialising it right now would PUT an empty list and delete
    // everything on the page. Re-queue instead and let the save that follows
    // hydration write the real content.
    if (this.isHydrating) {
      this.saveQueued = true;
      return;
    }
    if (this.isSaving) {
      this.saveQueued = true;
      return;
    }
    this.isSaving = true;
    this.updateSaveStatus();

    const elements = this.getCanvasElements();

    try {
      const saved = await api.put(`/scrapbooks/${this.activePage.id}/elements`, {
        revision: this.activePage.revision,
        elements,
      });
      this.activePage = saved;
      this.pages = this.pages.map((page) => page.id === saved.id ? saved : page);
      this.isSaving = false;
      this.hasUnsavedChanges = false;
      this.conflictRetries = 0;
      this.updateSaveStatus('Saved');
      if (this.saveQueued) {
        this.saveQueued = false;
        this.scheduleSave();
      }
    } catch (err) {
      this.isSaving = false;
      this.updateSaveStatus('Save failed');
      if (err.status === 409 && err.page?.revision !== undefined && this.conflictRetries < 1) {
        this.conflictRetries += 1;
        this.activePage = { ...this.activePage, revision: err.page.revision };
        this.pages = this.pages.map((page) => page.id === this.activePage.id ? { ...page, revision: err.page.revision } : page);
        this.saveQueued = false;
        this.scheduleSave();
        return;
      }
      toast.error(`Could not save scrapbook: ${err.message}`);
    }
  }

  async handleRemoteRevision(data) {
    if (!data?.scrapbookId || data.scrapbookId !== this.activePage?.id || this.isSaving) return;
    if (typeof data.revision !== 'number' || data.revision <= this.activePage.revision) return;
    try {
      this.activePage = await api.get(`/scrapbooks/${data.scrapbookId}`);
      this.pages = this.pages.map((page) => page.id === this.activePage.id ? this.activePage : page);
      this.update();
      await this.mountCanvas();
      toast.info('This scrapbook was updated by another member.');
    } catch (err) {
      toast.error(`Could not refresh the shared scrapbook: ${err.message}`);
    }
  }

  updateSaveStatus(text = 'Unsaved changes') {
    const status = this.$('.scrapbook-save-status');
    if (status) status.textContent = this.isSaving ? 'Saving...' : text;
  }

  async saveTitle() {
    const input = this.$('#scrapbook-title');
    if (!input || !this.activePage || this.activePage.isLocked) return;
    try {
      const updated = await api.patch(`/scrapbooks/${this.activePage.id}`, { title: input.value });
      this.activePage = { ...this.activePage, ...updated };
      this.pages = this.pages.map((page) => page.id === updated.id ? this.activePage : page);
      toast.success('Scrapbook title saved.');
      this.update();
      await this.mountCanvas();
    } catch (err) {
      toast.error(`Could not rename scrapbook: ${err.message}`);
    }
  }

  async deletePage() {
    if (!this.activePage) return;
    // Captured before the await, and this is the whole fix. Deleting broadcasts
    // over Pusher as well as answering the request, and the broadcast usually
    // lands first: `onScrapbookDeleted` drops the page and moves `activePage`
    // to the next one. Filtering by `this.activePage.id` at that point removed
    // the page that had *survived* instead of the one being deleted, which
    // emptied the page rail while the editor still showed a page - and the next
    // "new page" then reused the freed number, producing two pages both called
    // "Scrapbook 1". Filtering by the captured id makes the local delete
    // idempotent with the broadcast, whichever order they arrive in.
    const deletingId = this.activePage.id;
    if (!await confirmDialog({ title: 'Delete this scrapbook?', message: 'The page and its design will be permanently removed. Album photos stay safe in the gallery.', confirmLabel: 'Delete scrapbook', destructive: true })) return;
    try {
      await api.delete(`/scrapbooks/${deletingId}`);
      this.pages = this.pages.filter((page) => page.id !== deletingId);
      // Only fall through to another page if the deleted one is still the
      // active one. If the broadcast already moved us, that work is done and
      // re-selecting here would race the select it started.
      if (this.activePage?.id === deletingId) {
        this.activePage = this.pages[0] || null;
        this.update();
        if (this.activePage) await this.selectPage(this.activePage.id);
      } else {
        this.update();
      }
      toast.success('Scrapbook deleted.');
    } catch (err) {
      toast.error(`Could not delete scrapbook: ${err.message}`);
    }
  }

  async toggleLock() {
    if (!this.activePage) return;
    try {
      const updated = await api.patch(`/scrapbooks/${this.activePage.id}/lock`, { isLocked: !this.activePage.isLocked });
      this.activePage = { ...this.activePage, ...updated };
      this.pages = this.pages.map((page) => page.id === updated.id ? this.activePage : page);
      this.update();
      await this.mountCanvas();
      toast.success(updated.isLocked ? 'Scrapbook locked.' : 'Scrapbook unlocked.');
    } catch (err) {
      toast.error(`Could not change scrapbook lock: ${err.message}`);
    }
  }

  togglePhoto(input) {
    if (input.checked) this.selectedPhotoIds.add(input.value);
    else this.selectedPhotoIds.delete(input.value);
  }

  async addSelectedPhotos() {
    if (!this.canvas || !this.activePage || this.activePage.isLocked) return;
    const selected = this.photos.filter((photo) => this.selectedPhotoIds.has(photo.id));
    for (const photo of selected) {
      try {
        const image = await this.loadPhotoImage(photo.id, photo.r2Url);
        image.set({
          left: 80 + (this.canvas.getObjects().length % 4) * 250,
          top: 80 + (this.canvas.getObjects().length % 3) * 190,
          scaleX: 0.35,
          scaleY: 0.35,
          angle: (this.canvas.getObjects().length % 3 - 1) * 4,
          photoId: photo.id,
          elementType: 'photo',
          src: photo.r2Url,
          cornerStyle: 'round',
        });
        this.canvas.add(image);
      } catch (err) {
        toast.error(`Could not add photo: ${err.message}`);
      }
    }
    this.canvas.requestRenderAll();
    this.selectedPhotoIds.clear();
    this.element.querySelectorAll('.scrapbook-photo-picker').forEach((input) => { input.checked = false; });
    this.scheduleSave();
  }

  addText() {
    if (!this.canvas || this.activePage?.isLocked) return;
    const text = new Textbox('Write a memory', {
      left: 200,
      top: 160,
      fontSize: 34,
      // Without an explicit family fabric falls back to Times New Roman, which
      // never matched anything else on the page. FONTS[0] is one of the three
      // faces the app already loads, so the box measures correctly immediately.
      fontFamily: FONTS[0].family,
      fill: INK_COLORS[0],
      elementType: 'text',
      width: 300,
    });
    this.canvas.add(text);
    this.canvas.setActiveObject(text);
    this.recordHistory();
  }

  addShape(shapeId = 'rect', options = {}) {
    if (!this.canvas || this.activePage?.isLocked) return null;
    const definition = shapeDefinition(shapeId);
    // Each catalogue entry builds its own geometry, so a triangle is a Triangle
    // and a speech bubble is a Path - not a rectangle with a different label.
    const shape = definition.build(options);
    shape.set({
      left: this.canvas.getWidth() / 2,
      top: this.canvas.getHeight() / 2,
      originX: 'center',
      originY: 'center',
      elementType: 'shape',
      shapeId: definition.id,
    });
    this.applyShapePaint(shape, definition);
    if (definition.sides) shape.shapeSides = clampSides(options.sides ?? definition.sides.value, definition.sides);
    this.canvas.add(shape);
    this.canvas.setActiveObject(shape);
    this.recordHistory();
    this.refreshInspector();
    return shape;
  }

  /**
   * Give a freshly built shape its starting colour.
   *
   * Split by kind because an outline shape - the line - has no fill at all, so
   * setting `fill` on it does nothing and it stays invisible. Every colour
   * control from here on goes through `applyFill`, which knows the difference.
   */
  applyShapePaint(shape, definition) {
    if (definition?.stroke || shape.fill === null) {
      shape.set({ fill: null, stroke: SHAPE_INK, strokeWidth: shape.strokeWidth || 10, strokeLineCap: 'round' });
      shape.paintAsStroke = true;
    } else {
      shape.set({ fill: SHAPE_FILL, rx: shape.rx ?? 0, ry: shape.ry ?? 0 });
      shape.paintAsStroke = false;
    }
    // A new shape has no border, and saying so is not optional. fabric's default
    // `strokeWidth` is 1, so a shape that has never had a border still *measures*
    // as one, and the panel opened showing "On" with a weight of 1.
    if (shape.borderOn === undefined) shape.borderOn = false;
    return shape;
  }

  /**
   * Recolour the selection.
   *
   * One entry point for the swatch rows, because "the colour of this thing" is
   * the same question for a shape, a photo frame's mat, a doodle and text - the
   * only variation is whether the object paints with a fill or a stroke.
   */
  applyFill(color, options = {}) {
    const targets = this.getSelectedObjects();
    if (!targets.length || this.activePage?.isLocked) return;
    for (const object of targets) {
      if (object.type === 'group' || object.elementType === 'group') continue;
      if (object.elementType === 'sticker') {
        if (options.slot === undefined) continue;
        this.recolourStickerSlot(options.slot, color);
        continue;
      }
      if (object.paintAsStroke || object.fill === null) {
        object.set({ stroke: color, paintAsStroke: true });
      } else {
        object.set({ fill: color });
        // A Textbox caches its measured size, so recolouring one without a
        // re-measure leaves the box at the old metrics and the new colour
        // renders against a stale width.
        if (typeof object.initDimensions === 'function') object.initDimensions();
      }
      object.setCoords();
    }
    this.canvas.requestRenderAll();
    this.commitChange();
  }

  /**
   * Change a polygon's side count in place.
   *
   * Rebuilt rather than mutated because the geometry *is* the side count: a
   * Polygon has no sides property to set. Placement, size, rotation, paint and
   * border are carried across, so the shape does not jump.
   */
  setShapeSides(sides) {
    const object = this.getSelectedObject();
    if (!object || object.elementType !== 'shape' || this.activePage?.isLocked) return;
    const definition = shapeDefinition(object.shapeId);
    if (!definition.sides) return;
    const count = clampSides(sides, definition.sides);
    const index = this.canvas.getObjects().indexOf(object);
    if (index < 0) return;

    const rebuilt = definition.build({ sides: count });
    rebuilt.set({
      left: object.left,
      top: object.top,
      scaleX: object.scaleX,
      scaleY: object.scaleY,
      angle: object.angle,
      flipX: object.flipX,
      flipY: object.flipY,
      opacity: object.opacity,
      visible: object.visible,
      originX: object.originX,
      originY: object.originY,
      elementType: 'shape',
      shapeId: definition.id,
      shapeSides: count,
      paintAsStroke: object.paintAsStroke,
    });
    if (object.paintAsStroke) rebuilt.set({ fill: null, stroke: object.stroke, strokeWidth: object.strokeWidth });
    else rebuilt.set({ fill: object.fill });
    this.applyBorderToObject(rebuilt, this.savedBorderPatch({
      borderWidth: object.borderWidth,
      borderColor: object.borderColor,
      borderStyle: object.borderStyle,
      borderRadius: object.borderRadius,
    }));
    if (object.locked) this.applyObjectLock(rebuilt, true);
    rebuilt.setCoords();

    this.canvas.remove(object);
    this.canvas.insertAt(index, rebuilt);
    this.canvas.setActiveObject(rebuilt);
    this.commitChange();
  }

  /**
   * A layer's visibility is stored on the element, not only on the fabric
   * object, so it survives a reload. fabric's own `visible` flag is the single
   * source of truth at render time; this just mirrors it.
   */
  applyVisibility(object, element) {
    if (object && element && element.visible === false) {
      object.visible = false;
      object.set({ visible: false });
    }
    return object;
  }

  /**
   * The rim spec a sticker was saved with.
   *
   * Older sticker pages predate the opt-in rim, so an absent `rim` means "no
   * rim" rather than "use the default" - otherwise every existing sticker would
   * sprout a white outline the moment the catalogue was rebuilt.
   */
  rimSpecFor(properties) {
    const rim = properties.rim;
    if (!rim) return false;
    if (rim === true) return true;
    if (typeof rim === 'object') {
      return {
        color: rim.color || '#fffdf7',
        width: Number.isFinite(rim.width) ? rim.width : undefined,
        dash: rim.dash || null,
      };
    }
    return false;
  }

  /**
   * Rebuild a border patch from saved properties.
   *
   * Only the fields the author actually set are returned, so an object that was
   * never given a border is not handed a synthetic "solid, width 0" patch that
   * would then read as a deliberate choice in the panel.
   */
  savedBorderPatch(properties = {}) {
    const patch = {};
    if (properties.borderStyle) patch.style = properties.borderStyle;
    if (Number.isFinite(properties.borderWidth)) patch.width = properties.borderWidth;
    if (properties.borderColor) patch.color = properties.borderColor;
    if (Number.isFinite(properties.borderRadius)) patch.radius = properties.borderRadius;
    // `borderOn` is the explicit state, both ways. It is replayed because a
    // width of 0 alone cannot tell a switched-off border from a border that was
    // never set, and fabric's default strokeWidth of 1 cannot either.
    if (properties.borderOn === true) patch.on = true;
    if (properties.borderOn === false) patch.on = false;
    if (properties.borderMode) patch.mode = properties.borderMode;
    if (properties.boxColor) patch.boxColor = properties.boxColor;
    if (Number.isFinite(properties.boxPadding)) patch.boxPadding = properties.boxPadding;
    return patch;
  }

  /**
   * Cut the photo to a shape, the way a real mount does.
   *
   * The previous frame was a mat behind the photo plus a rule around it, which
   * is a border under another name - and the user was right to call that a no
   * no. A frame clips: the heart frame shows a heart, not a square photo with a
   * line round it.
   *
   * The clip is built against the photo's own box and installed as its
   * `clipPath`, in the image's local coordinates. Two consequences worth stating:
   *
   * - An object has exactly one clipPath, so a frame and a torn edge cannot
   *   coexist. Applying either clears the other.
   * - A stroke on a clipped photo is either invisible or traces a rectangle the
   *   photo no longer has, so a frame and a border are mutually exclusive too.
   */
  applyFrameToObject(object, frameId) {
    const frame = frameDefinition(frameId);
    const width = object.width || 300;
    const height = object.height || 200;
    if (frame.id === 'none') {
      object.clipPath = null;
      object.frame = null;
      object.clipStyle = null;
      object.setCoords();
      return object;
    }
    object.clipPath = frame.build(width, height);
    object.frame = frame.id;
    // The old mat is dropped rather than left behind: `padding` grows the
    // bounding box, so a stale value would leave an invisible margin the author
    // cannot select or clear.
    object.set({ padding: 0, backgroundColor: null });
    this.clearBorderOn(object);
    object.setCoords();
    return object;
  }

  applyFrame(frameId) {
    const targets = this.getSelectedObjects();
    if (!targets.length || this.activePage?.isLocked) return;
    for (const object of targets) {
      if (object.type === 'group' || object.elementType === 'group') continue;
      this.applyFrameToObject(object, frameId);
    }
    this.canvas.requestRenderAll();
    this.commitChange();
  }

  /**
   * Edit the border on the current selection.
   *
   * One patch method for width, colour, style and corner radius, so the panel
   * can send whichever control changed without each having to re-derive the
   * whole border from scratch.
   */
  applyBorder(patch = {}) {
    const targets = this.getSelectedObjects();
    if (!targets.length || this.activePage?.isLocked) return;
    for (const object of targets) {
      // A border and a frame are exclusive, so asking for one gives up the
      // other rather than leaving a stroke tracing a shape the photo is no
      // longer. Nothing is silently ignored.
      if (object.frame) this.applyFrameToObject(object, 'none');
      if (typeof object.text === 'string') this.applyTextBorderToObject(object, patch);
      else this.applyBorderToObject(object, patch);
    }
    this.canvas.requestRenderAll();
    this.commitChange();
  }

  /**
   * Turn the border off, or back on at the weight it had.
   *
   * Setting the weight to 0 is the only way a border could be removed before,
   * and that is not an intuition anybody has. This keeps the previous weight so
   * the toggle is reversible, and remembers the off state separately - a width
   * of 0 is indistinguishable from "never had one", so without a flag the
   * toggle could not tell off from unset.
   */
  toggleBorder() {
    const targets = this.getSelectedObjects();
    if (!targets.length || this.activePage?.isLocked) return;
    for (const object of targets) {
      if (object.type === 'group' || object.elementType === 'group') continue;
      if (typeof object.text === 'string') {
        const current = object.borderMode || 'none';
        const next = current === 'none' ? (object.lastBorderMode || 'glyph') : 'none';
        this.applyTextBorderToObject(object, { mode: next });
        continue;
      }
      if (object.borderOn === false) {
        this.applyBorderToObject(object, { width: object.lastBorderWidth || 3, on: true });
      } else {
        object.lastBorderWidth = object.borderWidth || object.strokeWidth || 3;
        this.applyBorderToObject(object, { on: false });
      }
    }
    this.canvas.requestRenderAll();
    this.commitChange();
  }

  /** Strip a border without recording it as the author's last choice. */
  clearBorderOn(object) {
    object.set({ stroke: null, strokeWidth: 0, strokeDashArray: null });
    object.borderWidth = 0;
    object.borderOn = false;
    object.doubleBorder = false;
    return object;
  }

  /**
   * A text box's border has two independent halves, and the panel exposes both.
   *
   * A stroke on a Textbox traces each glyph, which is a "sticker text" look; a
   * `backgroundColor` with padding draws a box round the whole block, which is
   * a label. The old panel could only ever do the first, and turned it on
   * without ever saying what it was doing.
   */
  applyTextBorderToObject(object, patch = {}) {
    const mode = patch.mode ?? object.borderMode ?? 'glyph';
    const width = patch.width ?? (object.borderWidth || 3);
    const color = patch.color ?? object.borderColor ?? object.stroke ?? '#2f241e';
    const style = BORDER_STYLES.find((item) => item.id === (patch.style ?? object.borderStyle)) || BORDER_STYLES[0];
    const glyphs = mode === 'glyph' || mode === 'both';
    const box = mode === 'box' || mode === 'both';

    if (glyphs) {
      object.set({
        stroke: color,
        strokeWidth: style.double ? width * 2.4 : width,
        strokeDashArray: style.dash,
        strokeUniform: true,
        // fabric would otherwise draw half the stroke inside the glyph, which
        // thins the letters as well as outlining them.
        paintFirst: 'stroke',
      });
    } else {
      object.set({ stroke: null, strokeWidth: 0, strokeDashArray: null, paintFirst: 'fill' });
    }

    if (box) {
      const padding = Math.max(0, Number(patch.boxPadding ?? object.boxPadding ?? 8) || 0);
      object.set({ backgroundColor: patch.boxColor ?? object.boxColor ?? color, padding });
    } else {
      object.set({ backgroundColor: null, padding: 0 });
    }

    object.borderMode = mode;
    object.borderWidth = width;
    object.borderColor = color;
    object.borderStyle = style.id;
    object.borderOn = mode !== 'none';
    object.boxColor = box ? (patch.boxColor ?? object.boxColor ?? color) : null;
    // Deliberately *not* zeroed when the box is off. The padding is the last
    // value the author chose, and zeroing it meant the first "box" border came
    // out hugging the letters with no gap at all - because `0` is not nullish,
    // the `?? 8` default never got a chance to apply.
    if (box) object.boxPadding = Number(patch.boxPadding ?? object.boxPadding ?? 8);
    object.doubleBorder = glyphs && !!style.double;
    if (mode !== 'none') object.lastBorderMode = mode;
    object.setCoords();
    return object;
  }

  /** Set the text border mode straight from the panel. */
  setTextBorderMode(mode) {
    const object = this.getSelectedText();
    if (!object || this.activePage?.isLocked) return;
    this.applyTextBorderToObject(object, { mode });
    this.canvas.requestRenderAll();
    this.commitChange();
  }

  /** Recolour a text box's ink - the "colour" question for a text selection. */
  applyTextColor(color) {
    const object = this.getSelectedText();
    if (!object || this.activePage?.isLocked) return;
    object.set({ fill: color });
    if (typeof object.initDimensions === 'function') object.initDimensions();
    this.canvas.requestRenderAll();
    this.commitChange();
  }

  /**
   * The same border edit, for one object, so a reload can replay it without
   * going through the selection.
   *
   * `object` may already carry a frame's border; a patch wins over it, which is
   * what stops "apply Polaroid, then set the weight to 6" from being undone by
   * the frame the next time the page opens.
   */
  applyBorderToObject(object, patch = {}) {
    if (!object || object.type === 'group' || object.elementType === 'group') return object;
    if (patch.on === false) return this.clearBorderOn(object);
    if (patch.on === true) object.borderOn = true;
    if (patch.style !== undefined) {
      const style = BORDER_STYLES.find((item) => item.id === patch.style) || BORDER_STYLES[0];
      // fabric has no double stroke, so a double border is faked with a stroke
      // 2.4x as wide, which is the same trick a CSS double border uses. The
      // number the author typed is kept in `borderWidth` so the slider does not
      // jump to the inflated value on the next click.
      if (style.double) {
        object.set({ strokeWidth: Math.max(1, (patch.width ?? object.borderWidth ?? 2) * 2.4), strokeDashArray: null });
        object.doubleBorder = true;
      } else {
        object.set({ strokeDashArray: style.dash });
        object.doubleBorder = false;
      }
      object.borderStyle = style.id;
    }
    if (patch.width !== undefined) {
      const width = Math.max(0, Number(patch.width) || 0);
      const base = object.doubleBorder ? width / 2.4 : width;
      object.set({ strokeWidth: base });
      object.borderWidth = width;
      // Setting a positive weight *is* asking for a border, whether or not the
      // toggle was already on. Anything else leaves the flag alone, so changing
      // the colour of an off border does not silently switch it back on.
      if (width > 0) object.borderOn = true;
    }
    if (patch.color !== undefined) {
      object.set({ stroke: patch.color });
      object.borderColor = patch.color;
    }
    if (patch.radius !== undefined) {
      const radius = Math.max(0, Number(patch.radius) || 0);
      // Only a rect can round its corners; setting rx on a Polygon does nothing
      // at all, so it is left alone rather than silently ignored.
      if (object.type === 'rect') object.set({ rx: radius, ry: radius });
      object.borderRadius = radius;
    }
    object.setCoords();
    return object;
  }

  /**
   * The sticker rim is the shape's own stroke painted under its fill, so
   * turning it on and off means rebuilding the vector rather than mutating
   * strokes - which is also what lets the flower's centre keep its own colour.
   */
  rebuildSticker(sticker) {
    const index = this.canvas.getObjects().indexOf(sticker);
    if (index < 0) return null;
    const rebuilt = buildSticker(sticker.stickerId, {
      colors: sticker.stickerColors,
      scale: 1,
      rim: this.rimSpecFor({ rim: sticker.stickerRim }),
    });
    rebuilt.set({
      left: sticker.left,
      top: sticker.top,
      scaleX: sticker.scaleX,
      scaleY: sticker.scaleY,
      angle: sticker.angle,
      flipX: sticker.flipX,
      flipY: sticker.flipY,
      opacity: sticker.opacity,
      visible: sticker.visible,
      elementType: 'sticker',
      stickerId: sticker.stickerId,
      stickerColors: sticker.stickerColors,
      stickerRim: sticker.stickerRim,
      locked: sticker.locked,
    });
    if (sticker.locked) this.applyObjectLock(rebuilt, true);
    rebuilt.setCoords();
    this.canvas.remove(sticker);
    this.canvas.insertAt(index, rebuilt);
    return rebuilt;
  }

  toggleStickerRim() {
    const sticker = this.getSelectedObject();
    if (!sticker || sticker.elementType !== 'sticker' || this.activePage?.isLocked) return;
    sticker.stickerRim = sticker.stickerRim ? false : { color: '#fffdf7', width: 7, dash: null };
    const rebuilt = this.rebuildSticker(sticker);
    if (rebuilt) {
      this.canvas.setActiveObject(rebuilt);
      this.commitChange();
    }
  }

  applyStickerRim(patch = {}) {
    const sticker = this.getSelectedObject();
    if (!sticker || sticker.elementType !== 'sticker' || this.activePage?.isLocked) return;
    const current = sticker.stickerRim && typeof sticker.stickerRim === 'object'
      ? { color: '#fffdf7', width: 7, dash: null, ...sticker.stickerRim }
      : { color: '#fffdf7', width: 7, dash: null };
    if (patch.width !== undefined) current.width = Math.max(0, Number(patch.width) || 0);
    if (patch.color !== undefined) current.color = patch.color;
    if (patch.style !== undefined) {
      const style = BORDER_STYLES.find((item) => item.id === patch.style) || BORDER_STYLES[0];
      current.dash = style.dash;
    }
    sticker.stickerRim = current;
    const rebuilt = this.rebuildSticker(sticker);
    if (rebuilt) {
      this.canvas.setActiveObject(rebuilt);
      this.commitChange();
    }
  }

  toggleFontMenu() {
    this.fontMenuOpen = !this.fontMenuOpen;
    this.refreshInspector();
  }

  setInspectorTab(tab) {
    if (!tab || tab === this.inspectorTab) return;
    this.inspectorTab = tab;
    const panel = this.$('.scrapbook-inspector-panel');
    if (panel) {
      this.refreshInspector();
    } else {
      // No canvas mounted yet, so a full render is safe and simpler.
      this.update();
    }
  }

  /**
   * Move the highlight to the current tab.
   *
   * The active class is only ever emitted by renderInspector(), which runs on a
   * full update(). setInspectorTab() deliberately avoids a full update (that
   * would detach the live <canvas>), so without this the highlight froze on
   * whichever tab happened to be open at mount and clicking a tab looked like
   * nothing had happened - the panel changed underneath a stale highlight.
   */
  syncInspectorTabs() {
    this.element?.querySelectorAll('.scrapbook-inspector-tab').forEach((button) => {
      const active = button.dataset.inspectorTab === this.inspectorTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
  }

  /**
   * Re-render only the inspector, leaving the canvas DOM untouched.
   *
   * `update()` rebuilds the whole component root, which detaches the <canvas>
   * fabric is bound to and drops a blank one in its place: the objects survive
   * in memory but nothing draws. Re-calling `mountCanvas()` instead is not a
   * fix either, because it rebuilds from the server's `activePage.elements` and
   * would throw away unsaved edits. So anything that needs to show new state
   * while the canvas is live refreshes through here.
   */
  refreshInspector() {
    const panel = this.$('.scrapbook-inspector-panel');
    if (!panel) return;
    const renderers = {
      insert: () => this.renderInsertPanel(),
      text: () => this.renderTextPanel(),
      stickers: () => this.renderStickersPanel(),
      style: () => this.renderStylePanel(),
      layers: () => this.renderLayersPanel(),
      arrange: () => this.renderArrangePanel(),
    };
    panel.innerHTML = (renderers[this.inspectorTab] || renderers.insert)();
    panel.dataset.panel = this.inspectorTab;
    this.syncInspectorTabs();
    this.refreshIcons();
  }

  /** The first selected object that is actually text. */
  getSelectedText() {
    return this.getSelectedObjects()
      .find((object) => typeof object?.text === 'string' && typeof object?.fontSize === 'number') || null;
  }

  /**
   * Fabric measures a text box against whatever font is actually loaded. If a
   * family has not arrived yet the box is sized with a fallback and stays
   * wrong until something else forces a re-measure, so wait for the face
   * before applying it.
   */
  async ensureFontLoaded(family, weight = 400, size = 32) {
    if (!family || !document.fonts?.load) return;
    try {
      await document.fonts.load(`${weight || 400} ${size || 32}px "${family}"`, 'Memora');
    } catch {
      // A font that never loads is a cosmetic problem, not a reason to abort.
    }
  }

  async applyTextStyle(patch) {
    if (!this.canvas || this.activePage?.isLocked) return;
    const targets = this.getSelectedObjects()
      .filter((object) => typeof object?.text === 'string' && typeof object?.fontSize === 'number');
    if (!targets.length) return;

    if (patch.fontFamily) {
      await this.ensureFontLoaded(patch.fontFamily, patch.fontWeight, patch.fontSize);
    }
    targets.forEach((object) => {
      object.set(patch);
      // Textbox caches its measured dimensions; a width change needs a re-init
      // or the glyphs overflow or clip against the old box.
      if (typeof object.initDimensions === 'function') object.initDimensions();
    });
    this.canvas.requestRenderAll();
    this.updateSelectionControls();
    this.recordHistory();
    this.refreshInspector();
  }

  /**
   * Recolour one of a sticker's colour slots.
   *
   * A sticker is not two colours: the cherries are red fruit on green stems, the
   * cake has icing and sponge and a cherry. The panel used to offer a fill and
   * an accent, which left every other colour frozen at whatever the catalogue
   * said. The slot list comes from the definition, and the whole vector is
   * rebuilt so the parts that share a slot move together and the rim survives.
   */
  recolourStickerSlot(slot, color) {
    if (!this.canvas || this.activePage?.isLocked) return;
    const sticker = this.getSelectedObjects().find((object) => object.elementType === 'sticker');
    if (!sticker?.stickerId) return;
    const at = Number(slot);
    // Loudly, not silently. A swatch whose slot did not reach the handler used
    // to do nothing at all, which is indistinguishable from a broken control.
    if (!Number.isInteger(at) || at < 0) {
      toast.error('Could not work out which colour to change. Try picking it again.');
      return;
    }

    const definition = stickerDefinition(sticker.stickerId);
    const current = stickerColors(definition, sticker.stickerColors).colors;
    const next = current.slice();
    next[at] = color;
    sticker.stickerColors = next;
    const rebuilt = this.rebuildSticker(sticker);
    if (!rebuilt) return;
    this.canvas.setActiveObject(rebuilt);
    this.commitChange();
  }

  addSticker(stickerId) {
    if (!this.canvas || this.activePage?.isLocked) return null;
    const sticker = buildSticker(stickerId);
    // Cascade repeat clicks so a run of stickers fans out instead of stacking
    // into one unselectable pile.
    const existing = this.canvas.getObjects().filter((object) => object.elementType === 'sticker').length;
    const offset = (existing % 6) * 26;
    sticker.set({
      left: this.canvas.getWidth() / 2 + offset,
      top: this.canvas.getHeight() / 2 + offset,
    });
    sticker.setCoords();
    this.canvas.add(sticker);
    this.canvas.setActiveObject(sticker);
    this.recordHistory();
    return sticker;
  }

  applyObjectLock(object, locked) {
    object.locked = locked === true;
    object.set({
      lockMovementX: object.locked,
      lockMovementY: object.locked,
      lockScalingX: object.locked,
      lockScalingY: object.locked,
      lockRotation: object.locked,
      hasControls: !object.locked,
      evented: true,
    });
  }

  applySelectionStyle(object) {
    object.set({
      transparentCorners: false,
      cornerColor: '#241712',
      cornerStrokeColor: '#fffaf3',
      borderColor: '#241712',
      borderScaleFactor: 2.5,
      cornerSize: 14,
      padding: 6,
      rotatingPointOffset: 24,
    });
  }

  fitCanvas() {
    if (!this.canvas) return;
    const stage = this.$('.scrapbook-canvas-stage');
    if (!stage) return;
    const availableWidth = Math.max(280, stage.clientWidth - 16);
    this.canvas.setZoom(Math.min(1, availableWidth / (this.activePage.canvasWidth || 1200)));
    this.centerContent();
    this.canvas.requestRenderAll();
  }

  centerContent() {
    if (!this.canvas) return;
    const objects = this.canvas.getObjects();
    if (!objects.length) return;
    const bounds = this.canvas.getObjects().reduce((current, object) => {
      const rect = object.getBoundingRect();
      return {
        left: Math.min(current.left, rect.left),
        top: Math.min(current.top, rect.top),
        right: Math.max(current.right, rect.left + rect.width),
        bottom: Math.max(current.bottom, rect.top + rect.height),
      };
    }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const contentCenter = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
    const canvasCenter = { x: this.canvas.getWidth() / 2, y: this.canvas.getHeight() / 2 };
    this.canvas.relativePan({
      x: (canvasCenter.x - contentCenter.x) * this.canvas.getZoom(),
      y: (canvasCenter.y - contentCenter.y) * this.canvas.getZoom(),
    });
  }

  getSelectedObject() {
    return this.canvas?.getActiveObject() || null;
  }

  updateSelectionControls() {
    const active = this.canvas?.getActiveObject();
    const selected = this.getSelectedObjects();
    if (active) this.applySelectionStyle(active);
    const lockable = selected.flatMap((object) => this.getLockableObjects(object));
    const allLocked = lockable.length > 0 && lockable.every((object) => object.locked === true);
    const lockButton = this.$('.btn-toggle-element-lock');
    const groupButton = this.$('.btn-group-elements');
    const ungroupButton = this.$('.btn-ungroup-elements');
    if (lockButton) {
      lockButton.classList.toggle('is-active', allLocked);
      const label = lockButton.querySelector('span');
      if (label) label.textContent = allLocked ? 'Unlock' : 'Lock';
      lockButton.querySelector('i')?.setAttribute('data-lucide', allLocked ? 'lock-open' : 'lock-keyhole');
      this.refreshIcons();
    }
    if (groupButton) {
      const canGroup = active?.type !== 'group' && selected.length > 1;
      groupButton.disabled = !canGroup || this.activePage?.isLocked;
      groupButton.classList.toggle('is-active', active?.type === 'group');
    }
    if (ungroupButton) {
      const isGroup = active?.type === 'group';
      ungroupButton.disabled = !isGroup || this.activePage?.isLocked;
      ungroupButton.classList.toggle('is-active', isGroup);
    }

    // The Text, Style and Stickers panels read the current selection, so they
    // have to follow it. Skipped while a field has focus, otherwise typing a
    // font size would rip the input out from under the caret on every change.
    const focused = document.activeElement;
    const typing = focused && this.element?.contains(focused)
      && ['INPUT', 'TEXTAREA', 'SELECT'].includes(focused.tagName);
    if (!typing && this.canvas && this.inspectorTab !== 'insert') {
      this.refreshInspector();
    }
  }

  toggleDrawing() {
    if (!this.canvas || this.activePage?.isLocked) return;
    this.setEditorMode(this.editorMode === 'draw' ? 'select' : 'draw');
  }

  setEditorMode(mode) {
    if (!this.canvas || this.activePage?.isLocked) return;
    this.canvas.wrapperEl.classList.remove('is-canvas-locked');
    this.$('.scrapbook-canvas-stage')?.classList.remove('is-canvas-locked');
    this.editorMode = mode;
    this.isDrawing = mode === 'draw';
    this.canvas.isDrawingMode = this.isDrawing;
    this.canvas.selection = mode === 'select';
    this.canvas.skipTargetFind = mode === 'hand' || mode === 'draw';
    this.canvas.setCursor(mode === 'hand' ? 'grab' : mode === 'draw' ? 'crosshair' : 'default');
    this.canvas.wrapperEl.classList.remove('editor-mode-select', 'editor-mode-hand', 'editor-mode-draw');
    this.canvas.wrapperEl.classList.add(`editor-mode-${mode}`);
    this.$('.scrapbook-canvas-stage')?.classList.remove('editor-mode-select', 'editor-mode-hand', 'editor-mode-draw');
    this.$('.scrapbook-canvas-stage')?.classList.add(`editor-mode-${mode}`);
    if (!this.canvas.freeDrawingBrush) {
      this.canvas.freeDrawingBrush = new PencilBrush(this.canvas);
    }
    // Width and colour come from the brush catalogue, not a hardcoded 5, so the
    // pen/marker/spray tools actually differ.
    this.syncBrushSettings();
    this.element?.querySelectorAll('.btn-editor-mode').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.mode === mode);
    });
  }

  setDoodleColor(color) {
    this.doodleColor = color;
    if (this.canvas?.freeDrawingBrush) this.canvas.freeDrawingBrush.color = color;
    this.element?.querySelectorAll('.btn-doodle-color').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.color === color);
    });
    if (this.editorMode !== 'draw') this.setEditorMode('draw');
    this.refreshInspector();
  }

  /**
   * Switch free-draw brush.
   *
   * The brush is applied to the *finished* path rather than the live stroke:
   * fabric's PencilBrush gives one polyline, and post-processing it is what lets
   * eight different tools share one drawing pipeline and one serialisation
   * format instead of forking the path:created handler eight ways.
   */
  setBrush(brushId) {
    this.brush = brushDefinition(brushId).id;
    this.syncBrushSettings();
    this.refreshInspector();
  }

  setBrushWidth(width) {
    this.brushWidthOverride = Math.max(1, Number(width) || 1);
    this.syncBrushSettings();
  }

  /** Push the current brush and colour into fabric's free-drawing brush. */
  syncBrushSettings() {
    const brush = this.canvas?.freeDrawingBrush;
    if (!brush) return;
    const definition = brushDefinition(this.brush);
    brush.width = this.brushWidthOverride || definition.width;
    brush.color = this.doodleColor;
    // An eraser is a real brush that removes what it draws over, rather than a
    // mode that has to pick and destroy objects: it can cut a stroke in half,
    // which a selection-based eraser cannot.
    if (typeof brush.eraser === 'boolean') brush.eraser = !!definition.eraser;
  }

  /**
   * Give a finished stroke the look of the brush that drew it.
   *
   * fabric's PencilBrush hands back one polyline, so the tools differ by how
   * that polyline is painted: width and opacity for marker and highlighter,
   * a noise filter for brush and crayon, round caps and a heavier downstroke
   * for the pen nib. Doing it here rather than inside the brush keeps a single
   * `doodle` serialisation - a stroke is a path plus a brush name, whichever
   * tool produced it.
   */
  decorateDoodle(path) {
    const definition = brushDefinition(path.brush || 'pen');
    const width = this.brushWidthOverride || definition.width;
    path.set({
      stroke: this.doodleColor,
      strokeWidth: width,
      opacity: definition.opacity ?? 1,
      fill: null,
      strokeLineCap: definition.taper ? 'round' : 'butt',
      strokeLineJoin: 'round',
      objectCaching: false,
    });
    if (definition.spray) {
      // Spray is one wide translucent pass rather than thousands of dots: at
      // this resolution a real particle spray is indistinguishable, costs far
      // more per stroke, and would serialise as megabytes of path data.
      path.set({ opacity: 0.16 });
    }
    if (typeof definition.filter === 'function') {
      path.filters = [definition.filter(filters, path)];
    }
    path.setCoords();
    return path;
  }

  // ── view ────────────────────────────────────────────────────────────────

  /**
   * Zoom, as a multiple of the fitted view.
   *
   * `null` means "fit to the stage". Zoom is kept in vpt coords and combined
   * with whatever pan the user has, so zoom and hand-pan compose instead of
   * fighting: the fitted size is recomputed on demand rather than cached, which
   * is what lets the same zoom survive a window resize.
   */
  fitScale() {
    if (!this.canvas) return 1;
    const stage = this.$('.scrapbook-canvas-stage');
    if (!stage) return 1;
    const available = stage.getBoundingClientRect();
    if (!available.width || !available.height) return 1;
    return Math.min(available.width / this.canvas.getWidth(), available.height / this.canvas.getHeight(), 1);
  }

  setZoom(multiplier) {
    if (!this.canvas) return;
    const fit = this.fitScale();
    const scale = fit * (multiplier ?? 1);
    this.zoom = multiplier;
    this.zoomPercent = Math.round((multiplier ?? 1) * 100);
    this.canvas.setViewportTransform([scale, 0, 0, scale, 0, 0]);
    this.canvas.requestRenderAll();
    this.syncZoomButtons();
  }

  zoomBy(delta) {
    const current = this.zoom ?? 1;
    // Clamped rather than free: past ~4x the page is mostly empty stage, and
    // below 0.25x there is nothing left to aim at.
    const next = Math.min(4, Math.max(0.25, Number((current + delta).toFixed(2))));
    if (next === current) return;
    this.setZoom(next);
  }

  syncZoomButtons() {
    this.element?.querySelectorAll('.scrapbook-zoom-label').forEach((label) => {
      label.textContent = `${this.zoomPercent}%`;
    });
  }

  async toggleFullscreen() {
    const target = this.$('.scrapbook-editor-shell');
    if (!target) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await target.requestFullscreen();
      }
    } catch (err) {
      // Fullscreen is blocked in some embedded contexts; the editor still works,
      // so this is a notice rather than an error.
      toast.error('Fullscreen is not available here');
    }
  }

  /**
   * Fullscreen can also be ended from outside the app (Esc, the browser's own
   * control), so the button has to follow the document rather than its own
   * last action.
   */
  syncFullscreenState() {
    this.isFullscreen = document.fullscreenElement === this.$('.scrapbook-editor-shell');
    this.element?.querySelectorAll('.btn-toggle-fullscreen').forEach((button) => {
      button.classList.toggle('is-active', this.isFullscreen);
      button.setAttribute('aria-pressed', String(this.isFullscreen));
    });
  }

  // ── layers ──────────────────────────────────────────────────────────────

  /** Top-level objects, topmost first - the order a layers list is read in. */
  getLayers() {
    if (!this.canvas) return [];
    return this.canvas.getObjects()
      .filter((object) => object && typeof object.toObject === 'function')
      .map((object, index) => ({ object, index }))
      .reverse();
  }

  layerName(object) {
    const type = object.elementType || (object.path ? 'doodle' : 'shape');
    if (type === 'sticker') return stickerDefinition(object.stickerId).label;
    if (type === 'text') return (object.text || 'Text').split('\n')[0].slice(0, 28) || 'Text';
    if (type === 'photo') return 'Photo';
    if (type === 'doodle') return 'Doodle';
    if (type === 'shape') return shapeDefinition(object.shapeId).label;
    return 'Group';
  }

  layerIcon(object) {
    const type = object.elementType || (object.path ? 'doodle' : 'shape');
    return {
      sticker: 'sparkles', text: 'type', photo: 'image', doodle: 'pen-line', shape: 'square', group: 'layers',
    }[type] || 'square';
  }

  /**
   * A stable handle for one canvas object, assigned on first use.
   *
   * fabric assigns an `id` to Shadow and to Image but *not* to FabricObject, so
   * a shape, textbox, polygon or group has `object.id === undefined`. Keying the
   * Layers panel off it meant every row rendered `data-layer-id="undefined"`,
   * every button therefore resolved to the first match, and hide/lock/reorder
   * all silently did nothing while the "selected" highlight lit up on all rows
   * at once.
   *
   * The counter is module-level so two workspaces open at once cannot mint the
   * same handle, and it never resets, so a handle is unique for the life of the
   * document.
   */
  layerHandle(object) {
    if (!object) return null;
    if (!object.scrapbookHandle) {
      layerHandleSeed += 1;
      object.scrapbookHandle = `L${layerHandleSeed}`;
    }
    return object.scrapbookHandle;
  }

  /**
   * Resolve a handle back to its object.
   *
   * Searched across the whole object tree, not just the top level, so a layer
   * list that ever shows group children can still act on them.
   */
  findLayer(handle) {
    if (!this.canvas || !handle) return null;
    const seen = [];
    const matches = (object) => this.layerHandle(object) === handle;
    const walk = (object) => {
      if (seen.includes(object)) return null;
      seen.push(object);
      if (matches(object)) return object;
      if (typeof object.getObjects !== 'function') return null;
      for (const child of object.getObjects()) {
        const hit = walk(child);
        if (hit) return hit;
      }
      return null;
    };
    for (const object of this.canvas.getObjects()) {
      const hit = walk(object);
      if (hit) return hit;
    }
    return null;
  }

  selectLayer(handle) {
    const layer = this.findLayer(handle);
    if (!layer || this.activePage?.isLocked) return;
    this.canvas.setActiveObject(layer);
    this.canvas.requestRenderAll();
    this.updateSelectionControls();
  }

  toggleLayerVisibility(handle) {
    const layer = this.findLayer(handle);
    if (!layer || this.activePage?.isLocked) return;
    // fabric's `visible` is the render-time truth and is saved with the
    // element, so a hidden layer is still saved and can be found again here.
    layer.set({ visible: layer.visible === false });
    this.canvas.requestRenderAll();
    this.commitChange();
  }

  toggleLayerLock(handle) {
    const layer = this.findLayer(handle);
    if (!layer || this.activePage?.isLocked) return;
    this.applyObjectLock(layer, layer.locked !== true);
    this.canvas.requestRenderAll();
    this.commitChange();
  }

  deleteLayer(handle) {
    const layer = this.findLayer(handle);
    if (!layer || this.activePage?.isLocked) return;
    this.canvas.discardActiveObject();
    this.canvas.remove(layer);
    this.commitChange();
  }

  /**
   * Move a layer one step through the stack.
   *
   * `canvas.insertAt(index, ...objects)` takes the index FIRST - getting the
   * argument order wrong splices the object itself out of `_objects` and
   * corrupts the saved page, so the bounds are clamped here rather than trusted
   * to the caller.
   */
  reorderLayer(handle, direction) {
    const objects = this.canvas?.getObjects() || [];
    const from = objects.findIndex((object) => this.layerHandle(object) === handle);
    if (from < 0 || this.activePage?.isLocked) return;
    const to = direction === 'up' ? from + 1 : from - 1;
    // Clamped here rather than trusted to the caller: the panel already disables
    // the end buttons, but a stale row can still be clicked after a change.
    if (to < 0 || to >= objects.length) return;
    const object = objects[from];
    this.canvas.remove(object);
    this.canvas.insertAt(to, object);
    this.canvas.requestRenderAll();
    this.commitChange();
  }

  // ── export ──────────────────────────────────────────────────────────────

  /**
   * Render the page to a data URL at its natural size.
   *
   * `toDataURL` is synchronous and the only reliable way to get the full
   * unclipped page - `toCanvasElement` would need the stage to be that large.
   * Multiplier 1 keeps the export at the page's own resolution.
   */
  exportPage(format = 'png', quality = 0.95) {
    if (!this.canvas) return null;
    const multiplier = Math.min(3, Math.max(1, 2400 / this.canvas.getWidth()));
    // Exports must show everything, including hidden layers, or a page saved
    // with something tucked away exports as a surprise.
    const previouslyHidden = this.canvas.getObjects().filter((object) => object.visible === false);
    previouslyHidden.forEach((object) => object.set({ visible: true }));
    const previousVpt = [...this.canvas.viewportTransform];
    this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    let dataUrl;
    try {
      dataUrl = this.canvas.toDataURL({ format, quality, multiplier });
    } finally {
      this.canvas.setViewportTransform(previousVpt);
      previouslyHidden.forEach((object) => object.set({ visible: false }));
      this.canvas.requestRenderAll();
    }
    return dataUrl;
  }

  exportAs(format) {
    if (this.activePage?.isLocked) {
      toast.error('Unlock the page to export it');
      return;
    }
    try {
      if (format === 'print') {
        this.printPage();
        return;
      }
      if (format === 'json') {
        // The editable source, not just a picture: the whole point of a
        // scrapbook you built yourself is being able to take it apart again.
        const payload = {
          title: this.activePage.title,
          pageSize: { width: this.canvas.getWidth(), height: this.canvas.getHeight() },
          elements: this.getCanvasElements(),
        };
        this.downloadBlob(
          new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
          `${this.fileBaseName()}.json`,
        );
        return;
      }
      const mime = format === 'jpeg' ? 'jpeg' : 'png';
      const dataUrl = this.exportPage(mime === 'jpeg' ? 'jpeg' : 'png', 0.95);
      if (!dataUrl) return;
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${this.fileBaseName()}.${mime === 'jpeg' ? 'jpg' : 'png'}`;
      link.click();
      toast.success(`Exported as ${link.download}`);
    } catch (err) {
      toast.error(`Could not export: ${err.message}`);
    }
  }

  fileBaseName() {
    const title = (this.activePage?.title || 'scrapbook').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return title || 'scrapbook';
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    // Revoking immediately can cancel the download in some browsers, so it is
    // deferred past the current task.
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /**
   * Print via a hidden iframe rather than a popup: a popup is blocked unless it
   * is opened synchronously from the click, and the image has to be rendered
   * first. Printing the live DOM instead would drag the whole editor chrome
   * into the printout.
   */
  printPage() {
    const dataUrl = this.exportPage('png', 1);
    if (!dataUrl) return;
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const cleanup = () => {
      setTimeout(() => frame.remove(), 1000);
    };
    frame.onload = () => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } finally {
        cleanup();
      }
    };
    frame.srcdoc = `<!doctype html><html><head><title>${(this.activePage?.title || 'Scrapbook')}</title>
      <style>
        @page { margin: 8mm; }
        html, body { margin: 0; height: 100%; background: #fff; }
        body { display: flex; align-items: center; justify-content: center; }
        img { max-width: 100%; max-height: 100%; object-fit: contain; }
      </style></head><body><img src="${dataUrl}" alt=""></body></html>`;
  }

  handleCanvasMouseDown(event) {
    if (this.editorMode !== 'hand') return;
    this.isPanning = true;
    this.panOrigin = { x: event.e.clientX, y: event.e.clientY };
    this.canvas.setCursor('grabbing');
  }

  handleCanvasMouseMove(event) {
    if (!this.isPanning || this.editorMode !== 'hand') return;
    const point = event.e;
    const deltaX = point.clientX - this.panOrigin.x;
    const deltaY = point.clientY - this.panOrigin.y;
    this.canvas.relativePan({ x: deltaX, y: deltaY });
    this.panOrigin = { x: point.clientX, y: point.clientY };
  }

  handleCanvasMouseUp() {
    this.isPanning = false;
    this.panOrigin = null;
    if (this.canvas) this.canvas.setCursor(this.editorMode === 'hand' ? 'grab' : 'default');
  }

  /**
   * Record that the page changed, once, from one place.
   *
   * Every inspector control used to repeat the same requestRenderAll /
   * recordHistory / refreshInspector trio, and forgetting one of the three is
   * how the panel ends up showing state the canvas no longer has.
   */
  commitChange() {
    this.canvas?.requestRenderAll();
    this.recordHistory();
    this.refreshInspector();
  }

  /**
   * Look up a photo look by id.
   *
   * `grayscale` and `sepia` are the two ids pages were saved under before the
   * catalogue existed; they are kept as aliases so old scrapbooks keep the look
   * the author chose rather than silently reverting to Original.
   */
  photoFilter(id) {
    if (id === 'grayscale') return PHOTO_FILTERS.find((filter) => filter.id === 'mono');
    if (id === 'sepia') return PHOTO_FILTERS.find((filter) => filter.id === 'sepia');
    return PHOTO_FILTERS.find((filter) => filter.id === id) || PHOTO_FILTERS[0];
  }

  applyFilterToObject(object, filterStyle) {
    const definition = this.photoFilter(filterStyle);
    object.filterStyle = filterStyle;
    object.filters = definition.build(filters);
    object.applyFilters();
  }

  applyFilter(filterStyle) {
    const objects = this.getSelectedObjects().filter((object) => object.elementType === 'photo');
    if (!objects.length || this.activePage?.isLocked) return;
    objects.forEach((object) => this.applyFilterToObject(object, filterStyle));
    this.commitChange();
  }

  applyTornToObject(object) {
    const width = object.width || 300;
    const height = object.height || 220;
    object.clipStyle = 'torn';
    // Seeded from the object's saved geometry rather than fabric's runtime `id`,
    // which is regenerated on every load and would make the tear crawl between
    // renders and between collaborators.
    const seed = hashString([
      object.elementType, Math.round(object.left), Math.round(object.top),
      Math.round(width), Math.round(height),
    ].join('|'));
    const tornPath = buildTornPath(width, height, seed);
    tornPath.absolutePositioned = false;
    // The tear is also a clip path, and an object has exactly one. A frame that
    // is already on would be silently overwritten, so it is cleared here and
    // the two are honestly exclusive rather than one quietly winning.
    object.frame = null;
    object.set({ clipPath: tornPath, objectCaching: true, dirty: true });
    object.setCoords();
  }

  applyTornEdge() {
    const objects = this.getSelectedObjects().filter((object) => object.elementType === 'photo');
    if (!objects.length || this.activePage?.isLocked) return;
    // Toggle, so a torn photo can be put back without a separate "remove" control.
    const shouldTear = !objects.every((object) => object.clipStyle === 'torn');
    objects.forEach((object) => {
      if (shouldTear) {
        this.applyTornToObject(object);
      } else {
        object.clipStyle = null;
        object.frame = null;
        object.clipPath = undefined;
        object.set({ dirty: true });
        object.setCoords();
      }
    });
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.refreshInspector();
  }

  async duplicateSelected() {
    const object = this.getSelectedObject();
    if (!object || this.activePage?.isLocked) return;
    // Every property the panels read back has to survive the clone, or the copy
    // is a working object with no identity: its layer name reverts to "Group",
    // its rim and frame disappear, and the Layers tab cannot find it.
    const copy = await object.clone([
      'photoId', 'elementType', 'src', 'locked', 'filterStyle', 'clipStyle',
      'stickerId', 'accentColor', 'stickerRim', 'shapeId', 'brush', 'visible',
      'frame', 'borderWidth', 'borderColor', 'borderStyle', 'borderRadius',
      'doubleBorder',
    ]);
    // A duplicate of something hidden would look like the duplicate failed, so
    // the copy is always shown.
    copy.set({ left: (object.left || 0) + 24, top: (object.top || 0) + 24, visible: true });
    this.canvas.add(copy);
    this.canvas.setActiveObject(copy);
    this.recordHistory();
  }

  /**
   * Move the selection through the stack.
   *
   * The four verbs are named for where the object ends up, not for which button
   * was pressed, and the bounds are left to fabric - calling bringObjectForward
   * on the topmost object is a no-op there, whereas a hand-rolled splice is not.
   */
  moveLayer(direction) {
    const object = this.getSelectedObject();
    if (!object || this.activePage?.isLocked) return;
    if (direction === 'up') this.canvas.bringObjectForward(object);
    else if (direction === 'down') this.canvas.sendObjectBackwards(object);
    else if (direction === 'front') this.canvas.bringObjectToFront(object);
    else if (direction === 'back') this.canvas.sendObjectToBack(object);
    else return;
    this.commitChange();
  }

  /**
   * Set the page background.
   *
   * Written to the server as well as the stage class, so a page keeps its paper
   * for the next person who opens it - and so the class list on the stage can be
   * rebuilt from a single source instead of accumulated.
   */
  applyBackground(backgroundId) {
    if (!this.activePage || this.activePage.isLocked) return;
    const background = backgroundDefinition(backgroundId);
    api.patch(`/scrapbooks/${this.activePage.id}`, { background: background.id })
      .then((updated) => {
        this.activePage = { ...this.activePage, ...updated };
        this.pages = this.pages.map((page) => page.id === updated.id ? this.activePage : page);
        const stage = this.$('.scrapbook-canvas-stage');
        if (stage) {
          // Remove every known background class, not just the previous one:
          // a class left behind from an earlier pick would sit under the new
          // paper and the two patterns would composite.
          stage.classList.remove(...PAGE_BACKGROUNDS.map((item) => item.className));
          stage.classList.add(background.className);
        }
        // The picker's own active state is rendered from `activePage.background`,
        // so without this the chosen paper only looked chosen after a reload.
        this.refreshInspector();
        toast.success(`${background.label} paper.`);
      })
      .catch((err) => toast.error(`Could not change the paper: ${err.message}`));
  }

  applyTemplate(templateId) {
    if (!this.activePage || this.activePage.isLocked) return;
    // Templates are the three presets that also seed a page's content; the
    // background picker handles paper on its own.
    const template = { blank: 'paper', 'film-strip': 'film', collage: 'collage' }[templateId];
    if (!template) return;
    this.applyBackground(template);
  }

  async loadPhotoImage(photoId, fallbackUrl) {
    const source = photoId ? api.getImageProxyUrl(photoId) : fallbackUrl;
    return FabricImage.fromURL(source, { crossOrigin: 'anonymous' });
  }

  render() {
    if (this.isLoading) {
      return '<div class="flex items-center justify-center min-h-[50vh]"><div class="loader-spinner"><div class="spinner-ring"></div></div></div>';
    }

    return `
      <section class="scrapbook-workspace" aria-label="Scrapbook editor">
        <aside class="scrapbook-page-rail">
          <div class="scrapbook-rail-header"><div><p class="scrapbook-kicker">Album studio</p><h2>Scrapbooks</h2></div><button class="btn-create-scrapbook icon-button" aria-label="Create scrapbook" title="Create scrapbook" ${this.isCreating ? 'disabled' : ''}><i data-lucide="plus"></i></button></div>
          <div class="scrapbook-page-list">
            ${this.pages.length ? this.pages.map((page) => `<button class="btn-select-scrapbook scrapbook-page-button ${this.activePage?.id === page.id ? 'is-active' : ''}" data-page-id="${page.id}"><span>${page.title}</span>${page.isLocked ? '<i data-lucide="lock" aria-label="Locked"></i>' : ''}</button>`).join('') : '<p class="scrapbook-empty-note">Create a page to start designing.</p>'}
          </div>
        </aside>

        <div class="scrapbook-editor-shell">
          ${this.activePage ? `
            ${this.renderTopbar()}
            <div class="scrapbook-editor-body">
              <div class="scrapbook-canvas-region">
                <div class="scrapbook-canvas-stage ${this.activePage.background}"><canvas id="scrapbook-canvas"></canvas></div>
              </div>
              ${this.renderInspector()}
            </div>
          ` : `<div class="scrapbook-empty-state"><i data-lucide="layout-template"></i><h2>Your album can hold many scrapbooks</h2><p>Create a page for the trip cover, a birthday spread, or any memory collection.</p><button class="btn-create-scrapbook tool-button"><i data-lucide="plus"></i><span>Create first scrapbook</span></button></div>`}
        </div>
      </section>
    `;
  }

  /** Mode, history, and page-level actions only. Everything else is per-tab. */
  renderTopbar() {
    const locked = this.activePage.isLocked;
    const modes = [
      { mode: 'select', icon: 'mouse-pointer-2', label: 'Select and edit' },
      { mode: 'hand', icon: 'hand', label: 'Pan the canvas' },
      { mode: 'draw', icon: 'pen-line', label: 'Draw' },
    ];
    return `
      <header class="scrapbook-topbar">
        <div class="scrapbook-title-row">
          <input id="scrapbook-title" value="${this.activePage.title}" aria-label="Scrapbook title" ${locked ? 'disabled' : ''} />
          <button class="btn-save-scrapbook-title icon-button" aria-label="Save scrapbook title" title="Save title" ${locked ? 'disabled' : ''}><i data-lucide="check"></i></button>
        </div>

        <div class="scrapbook-topbar-tools">
          <div class="scrapbook-segmented" role="group" aria-label="Editor mode">
            ${modes.map((item) => `<button class="btn-editor-mode tool-button ${this.editorMode === item.mode ? 'is-active' : ''}" data-mode="${item.mode}" ${locked ? 'disabled' : ''} title="${item.label}" aria-pressed="${this.editorMode === item.mode}"><i data-lucide="${item.icon}"></i><span class="sr-only">${item.label}</span></button>`).join('')}
          </div>
          <div class="scrapbook-segmented" role="group" aria-label="History">
            <button class="btn-undo-element tool-button" ${locked ? 'disabled' : ''} title="Undo (Ctrl+Z)" aria-label="Undo"><i data-lucide="undo-2"></i></button>
            <button class="btn-redo-element tool-button" ${locked ? 'disabled' : ''} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><i data-lucide="redo-2"></i></button>
          </div>
          <div class="scrapbook-segmented scrapbook-zoom" role="group" aria-label="Zoom">
            <button class="btn-zoom-out tool-button" title="Zoom out" aria-label="Zoom out"><i data-lucide="minus"></i></button>
            <button class="btn-zoom-reset tool-button scrapbook-zoom-label" title="Reset to 100%" aria-label="Reset zoom to 100%">${this.zoomPercent}%</button>
            <button class="btn-zoom-in tool-button" title="Zoom in" aria-label="Zoom in"><i data-lucide="plus"></i></button>
            <button class="btn-zoom-fit tool-button ${this.zoom === null ? 'is-active' : ''}" title="Fit to the stage" aria-label="Fit to the stage"><i data-lucide="scan"></i></button>
          </div>
        </div>

        <div class="scrapbook-topbar-end">
          <div class="scrapbook-segmented" role="group" aria-label="Export">
            <button class="btn-export tool-button" data-export="png" ${locked ? 'disabled' : ''} title="Download as PNG" aria-label="Download as PNG"><i data-lucide="image-down"></i></button>
            <button class="btn-export tool-button" data-export="jpeg" ${locked ? 'disabled' : ''} title="Download as JPEG" aria-label="Download as JPEG"><i data-lucide="file-image"></i></button>
            <button class="btn-export tool-button" data-export="print" title="Print" aria-label="Print"><i data-lucide="printer"></i></button>
            <button class="btn-export tool-button" data-export="json" ${locked ? 'disabled' : ''} title="Download the editable page as JSON" aria-label="Download as JSON"><i data-lucide="braces"></i></button>
            <button class="btn-toggle-fullscreen tool-button ${this.isFullscreen ? 'is-active' : ''}" title="Full screen" aria-label="Full screen" aria-pressed="${this.isFullscreen}"><i data-lucide="${this.isFullscreen ? 'minimize' : 'maximize'}"></i></button>
          </div>
          <span class="scrapbook-save-status" aria-live="polite">Saved</span>
          <span class="scrapbook-revision">Revision ${this.activePage.revision}</span>
          <button class="btn-toggle-scrapbook-lock tool-button" title="${locked ? 'Unlock scrapbook' : 'Lock scrapbook'}"><i data-lucide="${locked ? 'lock-open' : 'lock'}"></i><span>${locked ? 'Unlock' : 'Lock'}</span></button>
          <button class="btn-delete-scrapbook tool-button is-danger" title="Delete scrapbook"><i data-lucide="trash-2"></i><span>Delete</span></button>
        </div>
      </header>
    `;
  }

  /**
   * The inspector's six panels, in a 3x2 grid rather than one row.
   *
   * Six tabs across a 320px rail gave each about 45px, which is under a
   * comfortable touch target and truncated every label. A grid gives each tab a
   * real label and a real hit area without making the rail any wider.
   */
  renderInspector() {
    const tabs = [
      { id: 'insert', label: 'Insert', icon: 'plus-square' },
      { id: 'text', label: 'Text', icon: 'type' },
      { id: 'stickers', label: 'Stickers', icon: 'sparkles' },
      { id: 'style', label: 'Style', icon: 'palette' },
      { id: 'layers', label: 'Layers', icon: 'layers' },
      { id: 'arrange', label: 'Arrange', icon: 'move' },
    ];
    const panels = {
      insert: this.renderInsertPanel(),
      text: this.renderTextPanel(),
      stickers: this.renderStickersPanel(),
      style: this.renderStylePanel(),
      layers: this.renderLayersPanel(),
      arrange: this.renderArrangePanel(),
    };
    return `
      <aside class="scrapbook-inspector" aria-label="Editor tools">
        <div class="scrapbook-inspector-tabs" role="tablist">
          ${tabs.map((tab) => `<button class="scrapbook-inspector-tab ${this.inspectorTab === tab.id ? 'is-active' : ''}" data-inspector-tab="${tab.id}" role="tab" aria-selected="${this.inspectorTab === tab.id}" title="${tab.label}"><i data-lucide="${tab.icon}"></i><span>${tab.label}</span></button>`).join('')}
        </div>
        <div class="scrapbook-inspector-panel" role="tabpanel" data-panel="${this.inspectorTab}">
          ${panels[this.inspectorTab] || ''}
        </div>
      </aside>
    `;
  }

  /**
   * Swatch rows, one per palette, plus a native colour input.
   *
   * The native input is labelled by a swatch rather than shown as an OS widget,
   * so the picker matches the presets beside it - but it is still a real
   * `<input type=color>`, so the OS picker, the eyedropper and keyboard entry all
   * work.
   *
   * "Is the current colour one of the presets?" is answered against `PALETTES`,
   * the same list the swatches are built from, rather than against a second
   * list passed in by the caller. Two lists is how a swatch ended up marked
   * active *and* the custom picker next to it showing a different colour.
   */
  renderSwatches({ className, dataAttribute, active, disabled, inputAttribute, buttonAttribute }) {
    const presets = PALETTES.flatMap((palette) => palette.colors);
    const custom = !!active && !presets.includes(active);
    return `
      ${PALETTES.map((palette) => `
        <div class="scrapbook-swatch-row" role="group" aria-label="${palette.label}">
          ${palette.colors.map((color) => `<button class="${className} color-swatch ${active === color ? 'is-active' : ''}" ${dataAttribute}="${color}" ${buttonAttribute || ''} style="--swatch-color: ${color}" ${disabled ? 'disabled' : ''} aria-label="${color}" title="${color}"></button>`).join('')}
        </div>
      `).join('')}
      <div class="scrapbook-swatch-row scrapbook-swatch-row-custom">
        <label class="color-swatch color-swatch-custom ${custom ? 'is-active' : ''}" style="--swatch-color: ${custom ? active : 'conic-gradient(from 0deg, #c85a32, #e0a23c, #3f9b69, #3f7fd4, #8a6bb8, #c85a32)'}" title="${custom ? `${active} - pick another` : 'Pick any colour'}">
          <i data-lucide="pipette"></i>
          <input type="color" ${inputAttribute} value="${custom ? active : (presets.includes(active) ? active : '#c85a32')}" ${disabled ? 'disabled' : ''} aria-label="Pick any colour" title="${custom || presets.includes(active) ? active : ''}">
        </label>
      </div>
    `;
  }

  /**
   * The font picker.
   *
   * A <select> cannot render each option in its own typeface, which is the one
   * thing a scrapbook font menu has to do: you choose a face by seeing it, not
   * by reading its name. So this is a real listbox - a trigger showing the
   * current face, and a grouped menu where every row is set in the face it
   * offers. Grouped by category, because twelve unlabelled rows read as noise.
   */
  renderFontMenu(selection, ready) {
    const current = selection?.fontFamily || FONTS[0].family;
    const currentFont = FONTS.find((font) => font.family === current);
    const label = escapeHtml(currentFont ? currentFont.sample : 'Choose a typeface');
    const trigger = (open) => `
      <button class="scrapbook-font-trigger ${open ? 'is-open' : ''}" style="font-family: '${escapeAttr(current)}', Georgia, serif" aria-haspopup="listbox" aria-expanded="${open}" ${ready ? '' : 'disabled'}>
        <span>${label}</span>
        <i data-lucide="chevron-down"></i>
      </button>`;
    if (!this.fontMenuOpen) return `<div class="scrapbook-font-menu">${trigger(false)}</div>`;
    return `
      <div class="scrapbook-font-menu">
        ${trigger(true)}
        <div class="scrapbook-font-list" role="listbox" aria-label="Typeface">
          ${FONT_CATEGORIES.map((category) => {
            const fonts = FONTS.filter((font) => font.category === category);
            if (!fonts.length) return '';
            return `
              <p class="scrapbook-font-group">${category}</p>
              ${fonts.map((font) => `
                <button class="scrapbook-font-option ${current === font.family ? 'is-active' : ''}" style="font-family: '${escapeAttr(font.family)}', Georgia, serif" data-font-family="${escapeAttr(font.family)}" role="option" aria-selected="${current === font.family}">
                  <span>${escapeHtml(font.sample)}</span>
                  ${current === font.family ? '<i data-lucide="check"></i>' : ''}
                </button>
              `).join('')}
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  renderInsertPanel() {
    const locked = this.activePage.isLocked;
    return `
      <div class="scrapbook-panel">
        <section class="scrapbook-panel-section">
          <h3>Add to the page</h3>
          <div class="scrapbook-button-grid">
            <button class="btn-add-text tool-button" ${locked ? 'disabled' : ''}><i data-lucide="type"></i><span>Text</span></button>
            <button class="tool-button" data-goto-tab="text" ${locked ? 'disabled' : ''}><i data-lucide="palette"></i><span>Typography</span></button>
            <button class="tool-button" data-goto-tab="stickers" ${locked ? 'disabled' : ''}><i data-lucide="sparkles"></i><span>Sticker</span></button>
            <button class="tool-button" data-goto-tab="layers" ${locked ? 'disabled' : ''}><i data-lucide="layers"></i><span>Layers</span></button>
          </div>
        </section>

        <section class="scrapbook-panel-section">
          <div class="scrapbook-panel-heading">
            <div><h3>Shapes</h3><p>Each button shows the shape it actually places.</p></div>
          </div>
          <div class="scrapbook-shape-grid">
            ${SHAPES.map((shape) => `<button class="btn-add-shape scrapbook-shape-option" data-shape="${shape.id}" ${locked ? 'disabled' : ''} title="${shape.label}" aria-label="Add ${shape.label}">${shapeSvg(shape)}<span>${shape.label}</span></button>`).join('')}
          </div>
        </section>

        <section class="scrapbook-panel-section">
          <h3>Paper</h3>
          <div class="scrapbook-bg-grid">
            ${PAGE_BACKGROUNDS.map((background) => `<button class="btn-apply-background scrapbook-bg-option ${this.activePage.background === background.id ? 'is-active' : ''}" data-background="${background.id}" ${locked ? 'disabled' : ''} title="${background.label}" aria-pressed="${this.activePage.background === background.id}"><span class="scrapbook-bg-swatch is-${background.className}"></span><span class="scrapbook-bg-label">${background.label}</span></button>`).join('')}
          </div>
        </section>

        <section class="scrapbook-panel-section scrapbook-panel-section-grow">
          <div class="scrapbook-panel-heading">
            <div><h3>Photos</h3><p>Tick photos to place them here. They stay in the gallery too.</p></div>
            <button class="btn-add-selected-photos tool-button" ${locked ? 'disabled' : ''}><i data-lucide="image-plus"></i><span>Add</span></button>
          </div>
          ${this.photos.length
            ? `<div class="picker-grid">${this.photos.map((photo) => `<label class="picker-photo"><input class="scrapbook-photo-picker" type="checkbox" value="${photo.id}" ${this.selectedPhotoIds.has(photo.id) ? 'checked' : ''} ${locked ? 'disabled' : ''}><img src="${photo.r2Url}" alt="${escapeHtml(photo.caption || 'Album photo')}" loading="lazy"></label>`).join('')}</div>`
            : '<p class="scrapbook-panel-hint">This album has no photos yet. Add some from the Upload tab, then tick them here to place them on the page.</p>'}
        </section>
      </div>
    `;
  }

  renderTextPanel() {
    const locked = this.activePage.isLocked;
    const selection = this.getSelectedText();
    const ready = !locked && !!selection;
    const weights = [[400, 'Regular'], [500, 'Medium'], [600, 'Semi'], [700, 'Bold']];
    return `
      <div class="scrapbook-panel">
        <div class="scrapbook-panel-heading">
          <div><h3>Text</h3><p>${selection ? 'Restyling the selected text.' : 'Add a text box, or select one on the page.'}</p></div>
          <button class="btn-add-text tool-button" ${locked ? 'disabled' : ''}><i data-lucide="plus"></i><span>Add</span></button>
        </div>

        <section class="scrapbook-panel-section">
          <h3>Typeface</h3>
          ${this.renderFontMenu(selection, ready)}
        </section>

        <section class="scrapbook-panel-section">
          <h3>Size &amp; leading</h3>
          <div class="scrapbook-field-row">
            <label class="scrapbook-field"><span>Size</span><input class="scrapbook-number" type="number" min="8" max="240" step="1" value="${Math.round(selection?.fontSize || 34)}" data-text-prop="fontSize" ${ready ? '' : 'disabled'}></label>
            <label class="scrapbook-field"><span>Line</span><input class="scrapbook-number" type="number" min="0.6" max="3" step="0.05" value="${Number(selection?.lineHeight || 1.16).toFixed(2)}" data-text-prop="lineHeight" ${ready ? '' : 'disabled'}></label>
            <label class="scrapbook-field"><span>Track</span><input class="scrapbook-number" type="number" min="-60" max="400" step="1" value="${Math.round(selection?.charSpacing || 0)}" data-text-prop="charSpacing" ${ready ? '' : 'disabled'}></label>
          </div>
          <div class="scrapbook-button-grid scrapbook-button-grid-tight">
            ${weights.map(([weight, label]) => `<button class="btn-text-weight tool-button ${Number(selection?.fontWeight) === weight ? 'is-active' : ''}" data-font-weight="${weight}" ${ready ? '' : 'disabled'}>${label}</button>`).join('')}
            <button class="btn-text-style tool-button ${selection?.fontStyle === 'italic' ? 'is-active' : ''}" ${ready ? '' : 'disabled'}><i data-lucide="italic"></i><span>Italic</span></button>
          </div>
          <div class="scrapbook-button-grid scrapbook-button-grid-tight">
            ${[['left', 'align-left'], ['center', 'align-center'], ['right', 'align-right'], ['justify', 'align-justify']].map(([align, icon]) => `<button class="btn-text-align tool-button ${(selection?.textAlign || 'left') === align ? 'is-active' : ''}" data-text-align="${align}" ${ready ? '' : 'disabled'} title="Align ${align}" aria-label="Align ${align}"><i data-lucide="${icon}"></i></button>`).join('')}
          </div>
        </section>

        <section class="scrapbook-panel-section">
          <div class="scrapbook-panel-heading">
            <div><h3>Ink</h3><p>The colour of the letters themselves.</p></div>
          </div>
          <div class="scrapbook-swatch-stack">
            ${this.renderSwatches({
              className: 'btn-text-color',
              dataAttribute: 'data-text-color',
              active: selection?.fill,
              disabled: !ready,
              inputAttribute: 'data-text-color-input',
            })}
          </div>
        </section>

        ${selection ? `
          <section class="scrapbook-panel-section">
            <div class="scrapbook-panel-heading">
              <div><h3>Border</h3><p>Around the letters, round the box, or both.</p></div>
              <button class="btn-toggle-border tool-button ${(selection.borderMode || 'none') !== 'none' ? 'is-active' : ''}" ${locked ? 'disabled' : ''} role="switch" aria-checked="${(selection.borderMode || 'none') !== 'none' ? 'true' : 'false'}" title="Toggle the border"><i data-lucide="${(selection.borderMode || 'none') !== 'none' ? 'toggle-right' : 'toggle-left'}"></i><span>${(selection.borderMode || 'none') !== 'none' ? 'On' : 'Off'}</span></button>
            </div>
            <div class="scrapbook-button-grid scrapbook-button-grid-tight">
              ${TEXT_BORDERS.map((option) => `<button class="btn-text-border tool-button ${(selection.borderMode || 'none') === option.id ? 'is-active' : ''}" data-text-border="${option.id}" ${locked ? 'disabled' : ''} title="${option.hint}">${option.label}</button>`).join('')}
            </div>
          </section>
        ` : ''}
      </div>
    `;
  }

  /** The current border of the selection, or null when there is nothing to edit. */
  getBorderState() {
    const object = this.getSelectedObject();
    if (!object || object.type === 'group' || object.elementType === 'group') return null;
    // A sticker's edge is its rim, and the rim is the sticker's own stroke, so
    // editing it as a border would double it up. It has its own panel instead.
    if (object.elementType === 'sticker') return null;
    // A text box is not a single border either - see applyTextBorderToObject.
    if (typeof object.text === 'string') {
      return {
        width: Number(object.borderWidth ?? 3),
        color: object.borderColor || object.stroke || '#2f241e',
        style: object.borderStyle || 'solid',
        radius: 0,
        roundable: false,
        mode: object.borderMode || 'none',
        hasBorder: object.borderOn === true && (object.borderMode || 'none') !== 'none',
        boxColor: object.boxColor || object.borderColor || object.stroke || '#2f241e',
        boxPadding: Number(object.boxPadding ?? 8),
        isText: true,
      };
    }
    return {
      width: Number(object.borderWidth ?? 3),
      color: object.borderColor || object.stroke || '#2f241e',
      style: object.borderStyle || 'solid',
      radius: Number(object.borderRadius ?? (object.type === 'rect' ? object.rx ?? 0 : 0)),
      roundable: object.type === 'rect',
      // `borderOn` is the whole truth. Inferring it from `strokeWidth` looked
      // right until fabric's default of 1 made every untouched shape read as
      // "border on, weight 1".
      hasBorder: object.borderOn === true,
      mode: null,
      isText: false,
    };
  }

  /**
   * The colour the selection currently paints with.
   *
   * An outline shape - the line - has no fill, so its colour lives on the
   * stroke; everything else paints with the fill. Text is a fill too, which is
   * why recolouring text and recolouring a shape are the same question.
   */
  getPaintState() {
    const object = this.getSelectedObject();
    if (!object || object.type === 'group' || object.elementType === 'group') return null;
    if (object.elementType === 'sticker') return null;
    if (object.paintAsStroke || object.fill === null) {
      return { color: object.stroke || SHAPE_INK, asStroke: true, label: 'Ink', hint: 'This shape is drawn as a line.' };
    }
    // "Fill" is the word for a shape, but a text box's fill is its ink, and a
    // doodle's is its pen colour. Calling all three "Fill" left the author
    // guessing which was being changed.
    const isText = typeof object.text === 'string';
    const isDoodle = !!(object.elementType === 'doodle' || object.path);
    return {
      color: object.fill || SHAPE_FILL,
      asStroke: false,
      label: isText ? 'Ink' : isDoodle ? 'Pen colour' : 'Fill',
      hint: isText ? 'The colour of the letters.' : isDoodle ? 'The colour of the stroke.' : 'The main colour.',
    };
  }

  getRimState() {
    const sticker = this.getSelectedObjects().find((object) => object.elementType === 'sticker');
    if (!sticker) return null;
    const rim = sticker.stickerRim;
    const spec = rim && typeof rim === 'object' ? rim : { color: '#fffdf7', width: 7, dash: null };
    const style = BORDER_STYLES.find((item) => JSON.stringify(item.dash) === JSON.stringify(spec.dash || null)) || BORDER_STYLES[0];
    return {
      enabled: !!rim,
      color: spec.color || '#fffdf7',
      width: spec.width ?? 7,
      style: style.id,
    };
  }

  /** A selected sticker's editable colours, one entry per slot. */
  getStickerColors() {
    const sticker = this.getSelectedObjects().find((object) => object.elementType === 'sticker');
    if (!sticker?.stickerId) return null;
    return stickerColors(stickerDefinition(sticker.stickerId), sticker.stickerColors);
  }

  renderStickersPanel() {
    const locked = this.activePage.isLocked;
    const selection = this.getSelectedObjects().find((object) => object.elementType === 'sticker');
    const rim = this.getRimState();
    const slots = this.getStickerColors();
    return `
      <div class="scrapbook-panel">
        <p class="scrapbook-panel-hint">${selection ? 'Recolour the selected sticker.' : 'Pick a sticker to drop it on the page.'}</p>
        <section class="scrapbook-panel-section">
          <div class="scrapbook-sticker-grid">
            ${STICKERS.map((sticker) => `<button class="btn-add-sticker scrapbook-sticker-option" data-sticker="${sticker.id}" ${locked ? 'disabled' : ''} title="Add ${sticker.label}" aria-label="Add ${sticker.label}">${stickerSvg(sticker)}<span>${sticker.label}</span></button>`).join('')}
          </div>
        </section>

        ${selection && slots ? `
          <section class="scrapbook-panel-section">
            <div class="scrapbook-panel-heading">
              <div><h3>Colour</h3><p>${slots.count === 1 ? 'One colour on this sticker.' : `${slots.count} colours - every one is editable.`}</p></div>
            </div>
            ${slots.labels.map((label, slot) => `
              <div class="scrapbook-slot">
                <h4 class="scrapbook-slot-label">${escapeHtml(label)}</h4>
                <div class="scrapbook-swatch-stack">
                  ${this.renderSwatches({
                    className: 'btn-sticker-color',
                    dataAttribute: 'data-sticker-color',
                    // The slot index has to be on the *button*, not just the
                    // colour input: the button is what the click delegate sees,
                    // and without it every swatch arrived with an undefined slot
                    // and the recolour was dropped without a word.
                    buttonAttribute: `data-sticker-slot="${slot}"`,
                    active: slots.colors[slot],
                    disabled: locked,
                    inputAttribute: `data-sticker-color-input data-sticker-slot="${slot}"`,
                  })}
                </div>
              </div>
            `).join('')}
          </section>

          <section class="scrapbook-panel-section">
            <div class="scrapbook-panel-heading">
              <div><h3>Die-cut rim</h3><p>Off by default, so stickers sit clean on the paper.</p></div>
              <button class="btn-toggle-sticker-rim tool-button ${rim?.enabled ? 'is-active' : ''}" ${locked ? 'disabled' : ''} role="switch" aria-checked="${rim?.enabled ? 'true' : 'false'}" title="${rim?.enabled ? 'Remove rim' : 'Add rim'}"><i data-lucide="${rim?.enabled ? 'toggle-right' : 'toggle-left'}"></i><span>${rim?.enabled ? 'On' : 'Off'}</span></button>
            </div>
            ${rim?.enabled ? `
              <div class="scrapbook-field-row">
                <label class="scrapbook-field"><span>Width</span><input class="scrapbook-number" type="number" min="0" max="30" step="1" value="${Math.round(rim.width)}" data-sticker-rim-width ${locked ? 'disabled' : ''}></label>
                <label class="scrapbook-field scrapbook-field-color"><span>Ink</span><input class="scrapbook-color-input" type="color" value="${escapeAttr(/^#[0-9a-f]{6}$/i.test(rim.color) ? rim.color : '#fffdf7')}" data-sticker-rim-color ${locked ? 'disabled' : ''}></label>
              </div>
              <div class="scrapbook-button-grid scrapbook-button-grid-tight">
                ${BORDER_STYLES.map((style) => `<button class="btn-border-style tool-button ${rim.style === style.id ? 'is-active' : ''}" data-border-style="${style.id}" ${locked ? 'disabled' : ''}>${style.label}</button>`).join('')}
              </div>
            ` : ''}
          </section>
        ` : ''}
      </div>
    `;
  }

  renderStylePanel() {
    const locked = this.activePage.isLocked;
    const selected = this.getSelectedObjects();
    const photo = selected.find((object) => object.elementType === 'photo');
    const border = this.getBorderState();
    const paint = this.getPaintState();
    const shape = selected.find((object) => object.elementType === 'shape');
    const sides = shape ? shapeDefinition(shape.shapeId).sides : null;
    const brush = brushDefinition(this.brush);
    return `
      <div class="scrapbook-panel">
        <p class="scrapbook-panel-hint">${selected.length ? 'Styling the selection.' : 'Select something on the page to style it.'}</p>

        ${photo ? `
          <section class="scrapbook-panel-section">
            <h3>Look</h3>
            <div class="scrapbook-look-grid">
              ${PHOTO_FILTERS.map((filter) => `<button class="btn-apply-filter scrapbook-look-option ${photo.filterStyle === filter.id ? 'is-active' : ''}" data-filter="${filter.id}" ${locked ? 'disabled' : ''} title="${filter.label}" aria-pressed="${photo.filterStyle === filter.id}">${filter.label}</button>`).join('')}
            </div>
          </section>

          <section class="scrapbook-panel-section">
            <div class="scrapbook-panel-heading">
              <div><h3>Frame</h3><p>Cuts the photo to a shape. Replaces the border.</p></div>
            </div>
            <div class="scrapbook-look-grid">
              ${FRAMES.map((frame) => `<button class="btn-apply-frame scrapbook-look-option ${photo.frame === frame.id ? 'is-active' : ''}" data-frame="${frame.id}" ${locked ? 'disabled' : ''} title="${frame.label}" aria-pressed="${photo.frame === frame.id}">${frame.label}</button>`).join('')}
            </div>
          </section>

          <section class="scrapbook-panel-section">
            <div class="scrapbook-panel-heading">
              <div><h3>Edge</h3><p>A torn edge is also a cut, so it replaces the frame.</p></div>
            </div>
            <div class="scrapbook-button-grid">
              <button class="btn-apply-torn tool-button ${photo.clipStyle === 'torn' ? 'is-active' : ''}" ${locked ? 'disabled' : ''}><i data-lucide="scissors"></i><span>${photo.clipStyle === 'torn' ? 'Torn' : 'Tear edge'}</span></button>
            </div>
          </section>
        ` : ''}

        ${paint ? `
          <section class="scrapbook-panel-section">
            <div class="scrapbook-panel-heading">
              <div><h3>${escapeHtml(paint.label)}</h3><p>${escapeHtml(paint.hint)}</p></div>
            </div>
            ${this.renderSwatches({
              className: 'btn-apply-fill',
              dataAttribute: 'data-fill-color',
              active: paint.color,
              disabled: locked,
              inputAttribute: 'data-fill-color-input',
            })}
          </section>
        ` : ''}

        ${sides ? `
          <section class="scrapbook-panel-section">
            <h3>Sides</h3>
            <label class="scrapbook-field scrapbook-field-wide">
              <span>${sides.min}&ndash;${sides.max} sides</span>
              <input class="scrapbook-range" type="range" min="${sides.min}" max="${sides.max}" step="${sides.step || 1}" value="${clampSides(shape.shapeSides ?? sides.value, sides)}" data-shape-sides ${locked ? 'disabled' : ''}>
            </label>
            <p class="scrapbook-panel-hint">Currently ${clampSides(shape.shapeSides ?? sides.value, sides)} sides.</p>
          </section>
        ` : ''}

        ${border ? `
          <section class="scrapbook-panel-section">
            <div class="scrapbook-panel-heading">
              <div>
                <h3>Border</h3>
                <p>${border.isText ? 'Around the letters, round the box, or both.' : (border.roundable ? 'Weight, ink, dash and corners.' : 'Weight, ink and dash.')}</p>
              </div>
              <button class="btn-toggle-border tool-button ${border.hasBorder ? 'is-active' : ''}" ${locked ? 'disabled' : ''} role="switch" aria-checked="${border.hasBorder ? 'true' : 'false'}" title="${border.hasBorder ? 'Remove the border' : 'Add a border'}"><i data-lucide="${border.hasBorder ? 'toggle-right' : 'toggle-left'}"></i><span>${border.hasBorder ? 'On' : 'Off'}</span></button>
            </div>
            ${border.isText ? `
              <div class="scrapbook-button-grid scrapbook-button-grid-tight">
                ${TEXT_BORDERS.map((option) => `<button class="btn-text-border tool-button ${border.mode === option.id ? 'is-active' : ''}" data-text-border="${option.id}" ${locked ? 'disabled' : ''} title="${option.hint}">${option.label}</button>`).join('')}
              </div>
            ` : ''}
            ${border.hasBorder ? `
              <div class="scrapbook-field-row">
                <label class="scrapbook-field"><span>Weight</span><input class="scrapbook-number" type="number" min="1" max="40" step="1" value="${Math.max(1, Math.round(border.width))}" data-border-width ${locked ? 'disabled' : ''}></label>
                <label class="scrapbook-field scrapbook-field-color"><span>Ink</span><input class="scrapbook-color-input" type="color" value="${escapeAttr(/^#[0-9a-f]{6}$/i.test(border.color) ? border.color : '#2f241e')}" data-border-color-input ${locked ? 'disabled' : ''}></label>
                ${border.roundable ? `<label class="scrapbook-field"><span>Corner</span><input class="scrapbook-number" type="number" min="0" max="200" step="1" value="${Math.round(border.radius)}" data-border-radius ${locked ? 'disabled' : ''}></label>` : ''}
              </div>
              <div class="scrapbook-button-grid scrapbook-button-grid-tight">
                ${BORDER_STYLES.map((style) => `<button class="btn-border-style tool-button ${border.style === style.id ? 'is-active' : ''}" data-border-style="${style.id}" ${locked ? 'disabled' : ''}>${style.label}</button>`).join('')}
              </div>
              ${border.isText && (border.mode === 'box' || border.mode === 'both') ? `
                <div class="scrapbook-field-row">
                  <label class="scrapbook-field scrapbook-field-color"><span>Box</span><input class="scrapbook-color-input" type="color" value="${escapeAttr(/^#[0-9a-f]{6}$/i.test(border.boxColor || border.color) ? (border.boxColor || border.color) : '#2f241e')}" data-border-color-input ${locked ? 'disabled' : ''}></label>
                  <label class="scrapbook-field"><span>Padding</span><input class="scrapbook-number" type="number" min="0" max="60" step="1" value="${Math.round(border.boxPadding ?? 8)}" data-border-box-padding ${locked ? 'disabled' : ''}></label>
                </div>
              ` : ''}
              <div class="scrapbook-swatch-stack">
                ${this.renderSwatches({
                  className: 'btn-border-color',
                  dataAttribute: 'data-border-color',
                  active: border.color,
                  disabled: locked,
                  inputAttribute: 'data-border-color-input',
                })}
              </div>
            ` : '<p class="scrapbook-panel-hint">Turn the border on to set its weight, ink and dash.</p>'}
          </section>
        ` : ''}

        <section class="scrapbook-panel-section">
          <h3>Draw</h3>
          <p class="scrapbook-panel-hint">Pick Draw in the top bar to pen on the page.</p>
          <div class="scrapbook-brush-grid">
            ${BRUSHES.map((item) => `<button class="btn-pick-brush scrapbook-brush-option ${this.brush === item.id ? 'is-active' : ''}" data-brush="${item.id}" ${locked ? 'disabled' : ''} title="${item.label}" aria-pressed="${this.brush === item.id}"><i data-lucide="${BRUSH_ICONS[item.id] || 'pen-line'}"></i><span>${item.label}</span></button>`).join('')}
          </div>
          <label class="scrapbook-field scrapbook-field-wide">
            <span>${brush.label} weight</span>
            <input class="scrapbook-range" type="range" min="1" max="40" step="1" value="${this.brushWidthOverride || brush.width}" data-brush-width ${locked ? 'disabled' : ''}>
          </label>
          <h3 class="scrapbook-subhead">Pen colour</h3>
          ${this.renderSwatches({
            className: 'btn-doodle-color',
            dataAttribute: 'data-color',
            active: this.doodleColor,
            disabled: locked,
            inputAttribute: 'data-doodle-color-input',
          })}
        </section>
      </div>
    `;
  }

  /**
   * The Layers tab.
   *
   * Everything here acts on a layer by handle rather than on the selection, so
   * a hidden or locked layer can still be found, un-hidden and unlocked - which
   * is the whole reason for having the tab. A layer you cannot see or cannot
   * click is otherwise unrecoverable.
   */
  renderLayersPanel() {
    const locked = this.activePage.isLocked;
    const layers = this.getLayers();
    const activeHandles = this.getSelectedObjects().map((object) => this.layerHandle(object));
    return `
      <div class="scrapbook-panel">
        <div class="scrapbook-panel-heading">
          <div><h3>Layers</h3><p>${layers.length ? `${layers.length} on this page, topmost first.` : 'Nothing on this page yet.'}</p></div>
        </div>
        ${layers.length ? `
          <ul class="scrapbook-layer-list" role="list">
            ${layers.map(({ object, index }) => {
              const handle = this.layerHandle(object);
              const name = escapeHtml(this.layerName(object));
              const hidden = object.visible === false;
              const isLocked = object.locked === true;
              return `
                <li class="scrapbook-layer-row ${activeHandles.includes(handle) ? 'is-active' : ''} ${hidden ? 'is-hidden' : ''}">
                  <button class="btn-layer-select scrapbook-layer-main" data-layer-id="${handle}" ${locked ? 'disabled' : ''} title="Select ${name}">
                    <i data-lucide="${this.layerIcon(object)}"></i>
                    <span class="scrapbook-layer-name">${name}</span>
                  </button>
                  <div class="scrapbook-layer-tools">
                    <button class="btn-layer-up tool-button tool-button-tiny" data-layer-id="${handle}" ${locked || index === 0 ? 'disabled' : ''} title="Move up" aria-label="Move ${name} up"><i data-lucide="chevron-up"></i></button>
                    <button class="btn-layer-down tool-button tool-button-tiny" data-layer-id="${handle}" ${locked || index === layers.length - 1 ? 'disabled' : ''} title="Move down" aria-label="Move ${name} down"><i data-lucide="chevron-down"></i></button>
                    <button class="btn-layer-visibility tool-button tool-button-tiny ${hidden ? '' : 'is-active'}" data-layer-id="${handle}" ${locked ? 'disabled' : ''} title="${hidden ? 'Show' : 'Hide'}" aria-label="${hidden ? 'Show' : 'Hide'} ${name}"><i data-lucide="${hidden ? 'eye-off' : 'eye'}"></i></button>
                    <button class="btn-layer-lock tool-button tool-button-tiny ${isLocked ? 'is-active' : ''}" data-layer-id="${handle}" ${locked ? 'disabled' : ''} title="${isLocked ? 'Unlock' : 'Lock'}" aria-label="${isLocked ? 'Unlock' : 'Lock'} ${name}"><i data-lucide="${isLocked ? 'lock' : 'lock-open'}"></i></button>
                    <button class="btn-layer-delete tool-button tool-button-tiny is-danger" data-layer-id="${handle}" ${locked ? 'disabled' : ''} title="Delete" aria-label="Delete ${name}"><i data-lucide="trash-2"></i></button>
                  </div>
                </li>
              `;
            }).join('')}
          </ul>
        ` : '<p class="scrapbook-panel-hint">Add a photo, sticker or text box and it will appear here.</p>'}
      </div>
    `;
  }

  renderArrangePanel() {
    const locked = this.activePage.isLocked;
    const hasSelection = this.getSelectedObjects().length > 0;
    return `
      <div class="scrapbook-panel">
        <p class="scrapbook-panel-hint">${hasSelection ? 'Acting on the selection.' : 'Select something on the page first.'}</p>

        <section class="scrapbook-panel-section">
          <h3>Stack</h3>
          <div class="scrapbook-button-grid">
            <button class="btn-move-layer tool-button" data-direction="front" ${locked ? 'disabled' : ''}><i data-lucide="bring-to-front"></i><span>To front</span></button>
            <button class="btn-move-layer tool-button" data-direction="back" ${locked ? 'disabled' : ''}><i data-lucide="send-to-back"></i><span>To back</span></button>
            <button class="btn-move-layer tool-button" data-direction="up" ${locked ? 'disabled' : ''}><i data-lucide="arrow-up"></i><span>Forward</span></button>
            <button class="btn-move-layer tool-button" data-direction="down" ${locked ? 'disabled' : ''}><i data-lucide="arrow-down"></i><span>Backward</span></button>
          </div>
        </section>

        <section class="scrapbook-panel-section">
          <h3>Selection</h3>
          <div class="scrapbook-button-grid">
            <button class="btn-toggle-element-lock tool-button" ${locked ? 'disabled' : ''}><i data-lucide="lock-keyhole"></i><span>Lock</span></button>
            <button class="btn-duplicate-element tool-button" ${locked ? 'disabled' : ''}><i data-lucide="copy"></i><span>Duplicate</span></button>
            <button class="btn-group-elements tool-button"><i data-lucide="group"></i><span>Group</span></button>
            <button class="btn-ungroup-elements tool-button"><i data-lucide="ungroup"></i><span>Ungroup</span></button>
            <button class="btn-delete-element tool-button is-danger" ${locked ? 'disabled' : ''}><i data-lucide="trash-2"></i><span>Delete</span></button>
            <button class="tool-button" data-goto-tab="layers" ${locked ? 'disabled' : ''}><i data-lucide="layers"></i><span>All layers</span></button>
          </div>
        </section>
      </div>
    `;
  }
}
