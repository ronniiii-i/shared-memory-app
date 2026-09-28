import { Canvas, ActiveSelection, FabricImage, Rect, Circle, Ellipse, Textbox, Polygon, Path, PencilBrush, Group, filters } from 'fabric';
import { UIComponent } from '../core/UIComponent.js';
import { api } from '../services/api.js';
import { toast } from './Toast.js';
import { confirmDialog } from './ConfirmDialog.js';
import { subscribeToAlbum } from '../services/pusher.js';

const TEMPLATES = [
  { id: 'blank', label: 'Blank paper', background: 'paper' },
  { id: 'film-strip', label: 'Film strip', background: 'film' },
  { id: 'collage', label: 'Warm collage', background: 'collage' },
];

/** Small deterministic PRNG so a torn edge looks identical on every reload. */
function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Trace a closed rectangle with a ragged bite taken out of all four sides.
 *
 * The previous version used a hardcoded nine-point polygon with a fixed 7-8px
 * offset, which is why the effect read as "does not work": on a 900-3000px
 * photo a few pixels of jitter is invisible, and the left and right edges were
 * left perfectly straight so the shape never read as torn paper at all.
 *
 * Notches scale with the object and bite inward from every side, so the tear
 * is legible on a thumbnail and on a full-size export alike.
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

// ── Stickers ───────────────────────────────────────────────────────────────
// A sticker used to be a Textbox holding an emoji, which meant it rendered in
// whatever font the device had, could not be recoloured, had no die-cut edge,
// and ignored the size it was saved at. These are real vector shapes instead:
// scalable, themeable, and only a couple of hundred bytes each.
//
// The white rim is the shape's own stroke painted underneath its fill
// (`paintFirst: 'stroke'`), which is what gives a sticker its die-cut look
// without needing a second copy of every path.

const STICKER_RIM = '#fffdf7';

/** Alternating outer/inner radii, for stars and sunbursts. */
function radialPolygon(spikes, outerRadius, innerRadius, rotation = -Math.PI / 2) {
  const points = [];
  for (let index = 0; index < spikes * 2; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = rotation + (index * Math.PI) / spikes;
    points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return points;
}

/** Washi tape: straight along its length, torn at both ends. */
function tornTapePoints(width, height) {
  const random = seededRandom(20260928);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const points = [{ x: -halfWidth, y: -halfHeight }, { x: halfWidth, y: -halfHeight }];
  for (let index = 1; index < 5; index += 1) {
    points.push({ x: halfWidth + (index % 2 ? 3.5 : -3.5) * (0.5 + random()), y: -halfHeight + (height * index) / 5 });
  }
  points.push({ x: halfWidth, y: halfHeight }, { x: -halfWidth, y: halfHeight });
  for (let index = 1; index < 5; index += 1) {
    points.push({ x: -halfWidth + (index % 2 ? 3.5 : -3.5) * (0.5 + random()), y: halfHeight - (height * index) / 5 });
  }
  return points;
}

/**
 * Sticker geometry lives here once, as plain shape parts, and is rendered
 * twice: as fabric objects on the canvas and as inline SVG in the picker. One
 * source of truth, so a preview can never drift from what gets placed.
 *
 * A part with `fill: null` is a stroke-only detail (the leaf's midrib) and
 * does not get the die-cut rim.
 */
const STICKERS = [
  {
    id: 'heart', label: 'Heart', fill: '#c85a32',
    parts: () => [{ kind: 'path', rim: 8, d: 'M 50 90 C 18 66, 0 46, 0 29 C 0 13, 13 2, 27 2 C 38 2, 46 9, 50 18 C 54 9, 62 2, 73 2 C 87 2, 100 13, 100 29 C 100 46, 82 66, 50 90 Z' }],
  },
  {
    id: 'star', label: 'Star', fill: '#d69b3d',
    parts: () => [{ kind: 'polygon', rim: 8, points: radialPolygon(5, 50, 21) }],
  },
  {
    id: 'sparkle', label: 'Sparkle', fill: '#e0b64a',
    parts: () => [{ kind: 'path', rim: 6, d: 'M 50 2 C 57 33, 67 43, 98 50 C 67 57, 57 67, 50 98 C 43 67, 33 57, 2 50 C 33 43, 43 33, 50 2 Z' }],
  },
  {
    id: 'flower', label: 'Flower', fill: '#d98aa0', accent: '#e8c05a',
    parts: (accent) => {
      const parts = [];
      for (let index = 0; index < 5; index += 1) {
        const angle = (index * 2 * Math.PI) / 5 - Math.PI / 2;
        parts.push({
          kind: 'ellipse', rim: 6, rx: 15, ry: 27,
          x: Math.cos(angle) * 27, y: Math.sin(angle) * 27,
          angle: (angle * 180) / Math.PI,
        });
      }
      parts.push({ kind: 'circle', rim: 6, r: 16, fill: accent });
      return parts;
    },
  },
  {
    id: 'sunburst', label: 'Sunburst', fill: '#e0a23c',
    parts: () => [{ kind: 'polygon', rim: 6, points: radialPolygon(12, 50, 30) }],
  },
  {
    id: 'leaf', label: 'Leaf', fill: '#3f9b69', accent: '#2f6f4a',
    parts: (accent) => [
      { kind: 'path', rim: 8, d: 'M 6 94 C 6 42, 44 6, 94 6 C 94 58, 58 94, 6 94 Z' },
      { kind: 'path', fill: null, strokeWidth: 3, d: 'M 12 88 C 40 66, 62 44, 88 14' },
    ],
  },
  {
    id: 'arrow', label: 'Arrow', fill: '#2f6f8f',
    parts: () => [{ kind: 'path', rim: 7, d: 'M 4 36 L 56 36 L 56 12 L 96 50 L 56 88 L 56 64 L 4 64 Z' }],
  },
  {
    id: 'ribbon', label: 'Ribbon', fill: '#8a5a3b',
    parts: () => [{ kind: 'path', rim: 7, d: 'M 6 28 L 94 28 L 78 50 L 94 72 L 6 72 L 22 50 Z' }],
  },
  {
    id: 'tape', label: 'Tape', fill: '#e2b96a', viewBox: '-82 -28 164 56',
    parts: () => [{ kind: 'polygon', rim: 5, points: tornTapePoints(150, 44) }],
  },
];

/** One shape part as a fabric object. */
function partToFabric(part, fill, accent) {
  const isDetail = part.fill === null;
  const paint = isDetail
    ? { fill: null, stroke: part.stroke || accent, strokeWidth: part.strokeWidth || 3, strokeLineCap: 'round' }
    : {
      fill: part.fill || fill,
      stroke: STICKER_RIM,
      strokeWidth: part.rim || 6,
      strokeUniform: true,
      strokeLineJoin: 'round',
      strokeMiterLimit: 2,
      // Paint the rim first so only its outer half shows: the die-cut edge.
      paintFirst: 'stroke',
    };
  if (part.kind === 'path') return new Path(part.d, { ...paint, originX: 'center', originY: 'center' });
  if (part.kind === 'polygon') return new Polygon(part.points, { ...paint, originX: 'center', originY: 'center' });
  if (part.kind === 'circle') return new Circle({ ...paint, radius: part.r, originX: 'center', originY: 'center' });
  if (part.kind === 'ellipse') {
    return new Ellipse({
      ...paint, rx: part.rx, ry: part.ry, left: part.x || 0, top: part.y || 0, angle: part.angle || 0,
      originX: 'center', originY: 'center',
    });
  }
  return null;
}

/** The same part as inline SVG, for the picker. `paint-order` mirrors fabric. */
function partToSvg(part, fill, accent) {
  const isDetail = part.fill === null;
  const attributes = isDetail
    ? `fill="none" stroke="${part.stroke || accent || fill}" stroke-width="${part.strokeWidth || 3}"`
    : `fill="${part.fill || fill}" stroke="${STICKER_RIM}" stroke-width="${part.rim || 6}"`;
  const common = `${attributes} stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"`;
  if (part.kind === 'path') return `<path d="${part.d}" ${common} />`;
  if (part.kind === 'polygon') return `<polygon points="${part.points.map((point) => `${point.x},${point.y}`).join(' ')}" ${common} />`;
  if (part.kind === 'circle') return `<circle cx="0" cy="0" r="${part.r}" ${common} />`;
  if (part.kind === 'ellipse') {
    const cx = part.x || 0;
    const cy = part.y || 0;
    return `<ellipse cx="${cx}" cy="${cy}" rx="${part.rx}" ry="${part.ry}" transform="rotate(${part.angle || 0} ${cx} ${cy})" ${common} />`;
  }
  return '';
}

function stickerSvg(definition) {
  const parts = definition.parts(definition.accent);
  return `<svg viewBox="${definition.viewBox || '-62 -62 124 124'}" aria-hidden="true" focusable="false">${parts
    .map((part) => partToSvg(part, definition.fill, definition.accent))
    .join('')}</svg>`;
}

/**
 * Rebuild a sticker from its id. Sticker pages only store the id plus the two
 * swatch colours, so recolouring or resizing never has to round-trip a path.
 */
function buildSticker(stickerId, { fill, accentColor, scale } = {}) {
  const definition = STICKERS.find((item) => item.id === stickerId) || STICKERS[0];
  const main = fill || definition.fill;
  const accent = accentColor || definition.accent;
  const parts = definition.parts(accent)
    .map((part) => partToFabric(part, main, accent))
    .filter(Boolean);
  const group = new Group(parts, { subTargetCheck: false });
  group.elementType = 'sticker';
  group.stickerId = definition.id;
  group.fill = main;
  group.accentColor = accent || null;
  // Every shape is authored inside a 100-unit box, so one base scale keeps them
  // visually consistent without per-definition tuning.
  const size = (scale || 1) * 1.1;
  group.set({ scaleX: size, scaleY: size, originX: 'center', originY: 'center' });
  return group;
}

// ── Typography ─────────────────────────────────────────────────────────────
// The canvas could only ever use whatever the app already loaded, which for a
// scrapbook meant no handwriting at all. These are the families the picker
// offers; the woff2 files are fetched by the browser on first use, so opening
// the canvas tab costs nothing extra.

const FONTS = [
  { family: 'Newsreader', category: 'Serif', sample: 'the long way home' },
  { family: 'Playfair Display', category: 'Serif', sample: 'the long way home' },
  { family: 'Fraunces', category: 'Serif', sample: 'the long way home' },
  { family: 'Inter', category: 'Sans', sample: 'the long way home' },
  { family: 'Plus Jakarta Sans', category: 'Sans', sample: 'the long way home' },
  { family: 'Space Grotesk', category: 'Sans', sample: 'the long way home' },
  { family: 'Caveat', category: 'Hand', sample: 'the long way home' },
  { family: 'Patrick Hand', category: 'Hand', sample: 'the long way home' },
  { family: 'Architects Sister', category: 'Hand', sample: 'the long way home' },
  { family: 'Permanent Marker', category: 'Hand', sample: 'the long way home' },
  { family: 'Gloria Hallelujah', category: 'Hand', sample: 'the long way home' },
  { family: 'Pacifico', category: 'Script', sample: 'the long way home' },
];

/** The warm ink palette, shared by text and sticker colour pickers. */
const INK_COLORS = ['#2f241e', '#c85a32', '#8a5a3b', '#d69b3d', '#3f9b69', '#2f6f8f', '#6b4f8a', '#d98aa0'];

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
    // Which inspector tab is open. The old layout showed every control group at
    // once in one wrapping row, which is what made the editor feel cramped.
    this.inspectorTab = 'insert';
    this.isPanning = false;
    this.panOrigin = null;
    this.isCreating = false;
    // True only while `mountCanvas` is rebuilding the page. The canvas object
    // exists during that window but is still empty, so a save timer landing
    // here would PUT an empty element list and wipe the page.
    this.isHydrating = false;
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
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
    this.delegate('click', '.btn-add-shape', () => this.addShape());
    this.delegate('click', '.btn-add-sticker', (event, target) => this.addSticker(target.dataset.sticker));
    this.delegate('click', '.scrapbook-inspector-tab', (event, target) => this.setInspectorTab(target.dataset.inspectorTab));
    this.delegate('click', '[data-goto-tab]', (event, target) => this.setInspectorTab(target.dataset.gotoTab));
    this.delegate('click', '.scrapbook-font-option', (event, target) => this.applyTextStyle({ fontFamily: target.dataset.fontFamily }));
    this.delegate('click', '.btn-text-weight', (event, target) => this.applyTextStyle({ fontWeight: Number(target.dataset.fontWeight) }));
    this.delegate('click', '.btn-text-style', () => {
      const selection = this.getSelectedText();
      this.applyTextStyle({ fontStyle: selection?.fontStyle === 'italic' ? 'normal' : 'italic' });
    });
    this.delegate('click', '.btn-text-align', (event, target) => this.applyTextStyle({ textAlign: target.dataset.textAlign }));
    this.delegate('click', '.btn-text-color', (event, target) => this.applyTextStyle({ fill: target.dataset.textColor }));
    this.delegate('change', '[data-text-prop]', (event, target) => {
      const value = Number(target.value);
      if (Number.isFinite(value)) this.applyTextStyle({ [target.dataset.textProp]: value });
    });
    this.delegate('click', '.btn-sticker-color', (event, target) => this.recolourSticker(target.dataset.stickerColor));
    this.delegate('click', '.btn-apply-template', (event, target) => this.applyTemplate(target.dataset.template));
    this.delegate('click', '.btn-toggle-drawing', () => this.toggleDrawing());
    this.delegate('click', '.btn-editor-mode', (event, target) => this.setEditorMode(target.dataset.mode));
    this.delegate('click', '.btn-doodle-color', (event, target) => this.setDoodleColor(target.dataset.color));
    this.delegate('click', '.btn-apply-filter', (event, target) => this.applyFilter(target.dataset.filter));
    this.delegate('click', '.btn-apply-torn', () => this.applyTornEdge());
    this.delegate('click', '.btn-duplicate-element', () => this.duplicateSelected());
    this.delegate('click', '.btn-delete-element', () => this.deleteSelected());
    this.delegate('click', '.btn-move-layer', (event, target) => this.moveLayer(target.dataset.direction));
    this.delegate('click', '.btn-undo-element', () => this.undo());
    this.delegate('click', '.btn-redo-element', () => this.redo());
    this.delegate('click', '.btn-toggle-element-lock', () => this.toggleElementLock());
    this.delegate('click', '.btn-group-elements', () => this.groupSelected());
    this.delegate('click', '.btn-ungroup-elements', () => this.ungroupSelected());
    this.on(document, 'keydown', this.handleKeyDown);
    this.on(window, 'beforeunload', this.handleBeforeUnload);

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
      const page = await api.post(`/scrapbooks/album/${this.albumId}`, { title: `Scrapbook ${this.pages.length + 1}` });
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
      if (properties.clipStyle === 'torn') this.applyTornToObject(image);
      return image;
    }
    if (element.type === 'text') {
      const text = new Textbox(properties.text || 'Your memory', { ...properties, elementType: 'text', locked: element.locked });
      this.applyObjectLock(text, element.locked);
      return text;
    }
    if (element.type === 'sticker') {
      // Pages saved before the die-cut set have no stickerId: those stickers
      // are emoji Textboxes and must keep rendering as text, or existing
      // scrapbooks lose their stickers on next open.
      if (properties.stickerId) {
        const sticker = buildSticker(properties.stickerId, {
          fill: properties.fill,
          accentColor: properties.accentColor,
        });
        const { width, height, ...placement } = properties;
        sticker.set({ ...placement, elementType: 'sticker', stickerId: properties.stickerId, locked: element.locked });
        this.applyObjectLock(sticker, element.locked);
        return sticker;
      }
      const legacySticker = new Textbox(properties.text || '✨', {
        ...properties, fontSize: properties.fontSize || 54, elementType: 'sticker', locked: element.locked,
      });
      this.applyObjectLock(legacySticker, element.locked);
      return legacySticker;
    }
    if (element.type === 'shape') {
      const shape = new Rect({ fill: '#e7b66b', rx: 14, ry: 14, ...properties, elementType: 'shape', locked: element.locked });
      this.applyObjectLock(shape, element.locked);
      return shape;
    }
    if (element.type === 'doodle' && properties.path) {
      const doodle = new Path(properties.path, { ...properties, elementType: 'doodle', locked: element.locked });
      doodle.doodleColor = properties.doodleColor || properties.stroke || this.doodleColor;
      this.applyObjectLock(doodle, element.locked);
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
      flipX: object.flipX,
      flipY: object.flipY,
      path: object.path,
      stroke: object.stroke,
      strokeWidth: object.strokeWidth,
      filterStyle: object.filterStyle,
      clipStyle: object.clipStyle,
      doodleColor: object.doodleColor,
    };
    if (type === 'group') properties.objects = object.getObjects().map((child, childIndex) => this.serializeObject(child, childIndex));
    if (type === 'sticker') {
      // Only the id and swatches are stored - the vector is rebuilt from them,
      // so the sticker catalogue can grow without touching saved pages.
      properties.stickerId = object.stickerId || null;
      properties.accentColor = object.accentColor || null;
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
    if (!await confirmDialog({ title: 'Delete this scrapbook?', message: 'The page and its design will be permanently removed. Album photos stay safe in the gallery.', confirmLabel: 'Delete scrapbook', destructive: true })) return;
    try {
      await api.delete(`/scrapbooks/${this.activePage.id}`);
      this.pages = this.pages.filter((page) => page.id !== this.activePage.id);
      this.activePage = this.pages[0] || null;
      this.update();
      if (this.activePage) await this.selectPage(this.activePage.id);
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

  addShape() {
    if (!this.canvas || this.activePage?.isLocked) return null;
    const shape = new Rect({
      left: this.canvas.getWidth() / 2,
      top: this.canvas.getHeight() / 2,
      width: 220,
      height: 150,
      // Matches the rebuild path in buildFabricObject, so a saved shape comes
      // back with the same corner radius it was placed with.
      rx: 14,
      ry: 14,
      fill: '#e7b66b',
      originX: 'center',
      originY: 'center',
      elementType: 'shape',
    });
    this.canvas.add(shape);
    this.canvas.setActiveObject(shape);
    this.recordHistory();
    return shape;
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
      arrange: () => this.renderArrangePanel(),
    };
    panel.innerHTML = (renderers[this.inspectorTab] || renderers.insert)();
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

  recolourSticker(color) {
    if (!this.canvas || this.activePage?.isLocked) return;
    const sticker = this.getSelectedObjects().find((object) => object.elementType === 'sticker');
    if (!sticker?.stickerId) return;
    const definition = STICKERS.find((item) => item.id === sticker.stickerId);
    if (!definition) return;

    // Rebuild from the definition rather than patching fills in place: some
    // stickers have an accent part (the flower's centre) that must keep its own
    // colour, and hand-tracking that is exactly the kind of thing that drifts.
    const accent = definition.accent;
    const parts = definition.parts(accent)
      .map((part) => partToFabric(part, color, accent))
      .filter(Boolean);
    const index = this.canvas.getObjects().indexOf(sticker);
    this.canvas.remove(sticker);

    const rebuilt = new Group(parts, { subTargetCheck: false });
    rebuilt.elementType = 'sticker';
    rebuilt.stickerId = sticker.stickerId;
    rebuilt.fill = color;
    rebuilt.accentColor = accent || null;
    rebuilt.set({
      left: sticker.left, top: sticker.top,
      scaleX: sticker.scaleX, scaleY: sticker.scaleY,
      angle: sticker.angle, flipX: sticker.flipX, flipY: sticker.flipY,
      originX: sticker.originX, originY: sticker.originY,
    });
    rebuilt.setCoords();
    // fabric's signature is insertAt(index, ...objects) - index first. Passing
    // them the other way round splices the index in as an object and silently
    // drops the sticker.
    this.canvas.insertAt(index < 0 ? 0 : index, rebuilt);
    this.canvas.setActiveObject(rebuilt);
    this.canvas.requestRenderAll();
    this.updateSelectionControls();
    this.recordHistory();
    this.refreshInspector();
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
    this.canvas.freeDrawingBrush.width = 5;
    this.canvas.freeDrawingBrush.color = this.doodleColor;
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

  applyFilterToObject(object, filterStyle) {
    object.filterStyle = filterStyle;
    object.filters = filterStyle === 'grayscale'
      ? [new filters.Grayscale()]
      : filterStyle === 'sepia' ? [new filters.Sepia()] : [];
    object.applyFilters();
  }

  applyFilter(filterStyle) {
    const objects = this.getSelectedObjects().filter((object) => object.elementType === 'photo');
    if (!objects.length || this.activePage?.isLocked) return;
    objects.forEach((object) => this.applyFilterToObject(object, filterStyle));
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.refreshInspector();
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
    const copy = await object.clone(['photoId', 'elementType', 'src', 'locked', 'filterStyle', 'clipStyle']);
    copy.set({ left: (object.left || 0) + 24, top: (object.top || 0) + 24 });
    this.canvas.add(copy);
    this.canvas.setActiveObject(copy);
    this.recordHistory();
  }

  moveLayer(direction) {
    const object = this.getSelectedObject();
    if (!object || this.activePage?.isLocked) return;
    if (direction === 'up') this.canvas.bringObjectForward(object);
    else this.canvas.sendObjectBackwards(object);
    this.canvas.requestRenderAll();
    this.recordHistory();
  }

  applyTemplate(templateId) {
    if (!this.activePage || this.activePage.isLocked) return;
    const template = TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    api.patch(`/scrapbooks/${this.activePage.id}`, { template: template.id, background: template.background })
      .then((updated) => {
        this.activePage = { ...this.activePage, ...updated };
        this.pages = this.pages.map((page) => page.id === updated.id ? this.activePage : page);
        const stage = this.$('.scrapbook-canvas-stage');
        if (stage) {
          stage.classList.remove(...TEMPLATES.map((item) => item.background));
          stage.classList.add(template.background);
        }
        toast.success(`${template.label} applied.`);
      })
      .catch((err) => toast.error(`Could not apply template: ${err.message}`));
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
        </div>

        <div class="scrapbook-topbar-end">
          <span class="scrapbook-save-status" aria-live="polite">Saved</span>
          <span class="scrapbook-revision">Revision ${this.activePage.revision}</span>
          <button class="btn-toggle-scrapbook-lock tool-button" title="${locked ? 'Unlock scrapbook' : 'Lock scrapbook'}"><i data-lucide="${locked ? 'lock-open' : 'lock'}"></i><span>${locked ? 'Unlock' : 'Lock'}</span></button>
          <button class="btn-delete-scrapbook tool-button is-danger" title="Delete scrapbook"><i data-lucide="trash-2"></i><span>Delete</span></button>
        </div>
      </header>
    `;
  }

  renderInspector() {
    const tabs = [
      { id: 'insert', label: 'Insert', icon: 'plus-square' },
      { id: 'text', label: 'Text', icon: 'type' },
      { id: 'stickers', label: 'Stickers', icon: 'sparkles' },
      { id: 'style', label: 'Style', icon: 'palette' },
      { id: 'arrange', label: 'Arrange', icon: 'layers' },
    ];
    const panels = {
      insert: this.renderInsertPanel(),
      text: this.renderTextPanel(),
      stickers: this.renderStickersPanel(),
      style: this.renderStylePanel(),
      arrange: this.renderArrangePanel(),
    };
    return `
      <aside class="scrapbook-inspector" aria-label="Editor tools">
        <div class="scrapbook-inspector-tabs" role="tablist">
          ${tabs.map((tab) => `<button class="scrapbook-inspector-tab ${this.inspectorTab === tab.id ? 'is-active' : ''}" data-inspector-tab="${tab.id}" role="tab" aria-selected="${this.inspectorTab === tab.id}" title="${tab.label}"><i data-lucide="${tab.icon}"></i><span>${tab.label}</span></button>`).join('')}
        </div>
        <div class="scrapbook-inspector-panel" role="tabpanel" data-panel="${this.inspectorTab}">
          ${panels[this.inspectorTab]}
        </div>
      </aside>
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
            <button class="btn-add-shape tool-button" ${locked ? 'disabled' : ''}><i data-lucide="square"></i><span>Shape</span></button>
            <button class="tool-button" data-goto-tab="stickers" ${locked ? 'disabled' : ''}><i data-lucide="sparkles"></i><span>Sticker</span></button>
            <button class="tool-button" data-goto-tab="text" ${locked ? 'disabled' : ''}><i data-lucide="palette"></i><span>Typography</span></button>
          </div>
        </section>

        <section class="scrapbook-panel-section">
          <h3>Page background</h3>
          <div class="scrapbook-button-grid scrapbook-button-grid-tight">
            ${TEMPLATES.map((template) => `<button class="btn-apply-template tool-button" data-template="${template.id}" ${locked ? 'disabled' : ''}>${template.label}</button>`).join('')}
          </div>
        </section>

        <section class="scrapbook-panel-section scrapbook-panel-section-grow">
          <div class="scrapbook-panel-heading">
            <div><h3>Photos</h3><p>Tick photos to place them here. They stay in the gallery too.</p></div>
            <button class="btn-add-selected-photos tool-button" ${locked ? 'disabled' : ''}><i data-lucide="image-plus"></i><span>Add</span></button>
          </div>
          ${this.photos.length
            ? `<div class="picker-grid">${this.photos.map((photo) => `<label class="picker-photo"><input class="scrapbook-photo-picker" type="checkbox" value="${photo.id}" ${this.selectedPhotoIds.has(photo.id) ? 'checked' : ''} ${locked ? 'disabled' : ''}><img src="${photo.r2Url}" alt="${photo.caption || 'Album photo'}" loading="lazy"></label>`).join('')}</div>`
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
        <p class="scrapbook-panel-hint">${selection ? 'Restyling the selected text.' : 'Select a text box on the page to restyle it.'}</p>

        <section class="scrapbook-panel-section">
          <h3>Typeface</h3>
          <div class="scrapbook-font-grid">
            ${FONTS.map((font) => `<button class="scrapbook-font-option ${selection?.fontFamily === font.family ? 'is-active' : ''}" style="font-family: '${font.family}', Georgia, serif" data-font-family="${font.family}" ${ready ? '' : 'disabled'} title="${font.category} — ${font.family}"><span>${font.sample}</span></button>`).join('')}
          </div>
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
            <button class="btn-text-style tool-button ${selection?.fontStyle === 'italic' ? 'is-active' : ''}" data-font-style="italic" ${ready ? '' : 'disabled'}><i data-lucide="italic"></i><span>Italic</span></button>
          </div>
          <div class="scrapbook-button-grid scrapbook-button-grid-tight">
            ${[['left', 'align-left'], ['center', 'align-center'], ['right', 'align-right'], ['justify', 'align-justify']].map(([align, icon]) => `<button class="btn-text-align tool-button ${(selection?.textAlign || 'left') === align ? 'is-active' : ''}" data-text-align="${align}" ${ready ? '' : 'disabled'} title="${align}" aria-label="Align ${align}"><i data-lucide="${icon}"></i></button>`).join('')}
          </div>
        </section>

        <section class="scrapbook-panel-section">
          <h3>Ink</h3>
          <div class="scrapbook-swatch-row">
            ${INK_COLORS.map((color) => `<button class="btn-text-color color-swatch ${selection?.fill === color ? 'is-active' : ''}" data-text-color="${color}" style="--swatch-color: ${color}" ${ready ? '' : 'disabled'} aria-label="Ink ${color}" title="${color}"></button>`).join('')}
          </div>
        </section>
      </div>
    `;
  }

  renderStickersPanel() {
    const locked = this.activePage.isLocked;
    const selection = this.getSelectedObjects().find((object) => object.elementType === 'sticker');
    return `
      <div class="scrapbook-panel">
        <p class="scrapbook-panel-hint">${selection ? 'Recolour the selected sticker.' : 'Pick a sticker to drop it on the page.'}</p>
        <section class="scrapbook-panel-section">
          <div class="scrapbook-sticker-grid">
            ${STICKERS.map((sticker) => `<button class="btn-add-sticker scrapbook-sticker-option" data-sticker="${sticker.id}" ${locked ? 'disabled' : ''} title="Add ${sticker.label}">${stickerSvg(sticker)}<span>${sticker.label}</span></button>`).join('')}
          </div>
        </section>
        <section class="scrapbook-panel-section">
          <h3>Colour</h3>
          <div class="scrapbook-swatch-row">
            ${INK_COLORS.map((color) => `<button class="btn-sticker-color color-swatch ${selection?.fill === color ? 'is-active' : ''}" data-sticker-color="${color}" style="--swatch-color: ${color}" ${locked || !selection ? 'disabled' : ''} aria-label="Sticker colour ${color}" title="${color}"></button>`).join('')}
          </div>
        </section>
      </div>
    `;
  }

  renderStylePanel() {
    const locked = this.activePage.isLocked;
    const photo = this.getSelectedObjects().find((object) => object.elementType === 'photo');
    const filters = [['grayscale', 'Mono'], ['sepia', 'Sepia'], ['none', 'Original']];
    const swatches = ['#c85a32', '#2f6f8f', '#6b4f8a', '#3f9b69', '#d69b3d', '#24201d'];
    return `
      <div class="scrapbook-panel">
        <p class="scrapbook-panel-hint">${photo ? 'Styling the selected photo.' : 'Select a photo to restyle it.'}</p>

        <section class="scrapbook-panel-section">
          <h3>Photo treatment</h3>
          <div class="scrapbook-button-grid scrapbook-button-grid-tight">
            ${filters.map(([filter, label]) => `<button class="btn-apply-filter tool-button" data-filter="${filter}" ${locked || !photo ? 'disabled' : ''}>${label}</button>`).join('')}
          </div>
          <div class="scrapbook-button-grid scrapbook-button-grid-tight">
            <button class="btn-apply-torn tool-button ${photo?.clipStyle === 'torn' ? 'is-active' : ''}" ${locked || !photo ? 'disabled' : ''}><i data-lucide="scissors"></i><span>${photo?.clipStyle === 'torn' ? 'Torn' : 'Tear edge'}</span></button>
          </div>
        </section>

        <section class="scrapbook-panel-section">
          <h3>Pen colour</h3>
          <div class="scrapbook-swatch-row">
            ${swatches.map((color) => `<button class="btn-doodle-color color-swatch ${this.doodleColor === color ? 'is-active' : ''}" data-color="${color}" style="--swatch-color: ${color}" ${locked ? 'disabled' : ''} aria-label="Pen colour ${color}" title="${color}"></button>`).join('')}
          </div>
          <p class="scrapbook-panel-hint">Pick Draw in the top bar to pen on the page.</p>
        </section>
      </div>
    `;
  }

  renderArrangePanel() {
    const locked = this.activePage.isLocked;
    return `
      <div class="scrapbook-panel">
        <p class="scrapbook-panel-hint">${this.getSelectedObjects().length ? 'Acting on the selection.' : 'Select something on the page first.'}</p>

        <section class="scrapbook-panel-section">
          <h3>Stack</h3>
          <div class="scrapbook-button-grid scrapbook-button-grid-tight">
            <button class="btn-move-layer tool-button" data-direction="up" ${locked ? 'disabled' : ''}><i data-lucide="bring-to-front"></i><span>Forward</span></button>
            <button class="btn-move-layer tool-button" data-direction="down" ${locked ? 'disabled' : ''}><i data-lucide="send-to-back"></i><span>Backward</span></button>
          </div>
        </section>

        <section class="scrapbook-panel-section">
          <h3>Selection</h3>
          <div class="scrapbook-button-grid scrapbook-button-grid-tight">
            <button class="btn-toggle-element-lock tool-button" ${locked ? 'disabled' : ''}><i data-lucide="lock-keyhole"></i><span>Lock</span></button>
            <button class="btn-duplicate-element tool-button" ${locked ? 'disabled' : ''}><i data-lucide="copy"></i><span>Duplicate</span></button>
            <button class="btn-group-elements tool-button"><i data-lucide="group"></i><span>Group</span></button>
            <button class="btn-ungroup-elements tool-button"><i data-lucide="ungroup"></i><span>Ungroup</span></button>
            <button class="btn-delete-element tool-button is-danger" ${locked ? 'disabled' : ''}><i data-lucide="trash-2"></i><span>Delete</span></button>
          </div>
        </section>
      </div>
    `;
  }
}
