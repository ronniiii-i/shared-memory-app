import { Canvas, FabricImage, Rect, Textbox, Polygon, Path, PencilBrush, filters } from 'fabric';
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
    this.isPanning = false;
    this.panOrigin = null;
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
    this.delegate('click', '.btn-add-sticker', (event, target) => this.addSticker(target.dataset.sticker));
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
    try {
      const page = await api.post(`/scrapbooks/album/${this.albumId}`, { title: `Scrapbook ${this.pages.length + 1}` });
      this.pages.push(page);
      await this.selectPage(page.id);
      toast.success('New scrapbook page created.');
    } catch (err) {
      toast.error(`Could not create scrapbook: ${err.message}`);
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
    this.canvas?.dispose();

    this.canvas = new Canvas(canvasElement, {
      width: this.activePage.canvasWidth || 1200,
      height: this.activePage.canvasHeight || 800,
      selection: !this.activePage.isLocked,
      preserveObjectStacking: true,
    });
    this.canvas.wrapperEl.classList.add('scrapbook-fabric-wrapper');
    this.canvas.on('object:modified', () => this.recordHistory());
    this.canvas.on('object:added', () => this.recordHistory());
    this.canvas.on('object:removed', () => this.recordHistory());
    this.canvas.on('path:created', ({ path }) => {
      path.elementType = 'doodle';
      path.doodleColor = this.doodleColor;
      this.recordHistory();
    });
    this.canvas.on('mouse:down', (event) => this.handleCanvasMouseDown(event));
    this.canvas.on('mouse:move', (event) => this.handleCanvasMouseMove(event));
    this.canvas.on('mouse:up', () => this.handleCanvasMouseUp());

    this.isApplyingHistory = true;
    for (const element of this.activePage.elements || []) {
      await this.restoreElement(element);
    }
    this.isApplyingHistory = false;
    this.history = [];
    this.historyIndex = -1;
    this.hasUnsavedChanges = false;
    this.recordHistory();
    this.canvas.requestRenderAll();
    this.fitCanvas();
  }

  async restoreElement(element) {
    const properties = this.safeFabricProperties(element.properties || {});
    if (element.type === 'photo' && properties.src) {
      const matchingPhoto = this.photos.find((photo) => photo.id === element.photoId || photo.r2Url === properties.src);
      const image = await this.loadPhotoImage(matchingPhoto?.id || element.photoId, properties.src);
      image.set({ ...properties, photoId: element.photoId, elementType: 'photo', locked: element.locked });
      this.applyObjectLock(image, element.locked);
      if (properties.filterStyle) this.applyFilterToObject(image, properties.filterStyle);
      if (properties.clipStyle === 'torn') this.applyTornToObject(image);
      this.canvas.add(image);
      return;
    }
    if (element.type === 'text') {
      const text = new Textbox(properties.text || 'Your memory', { ...properties, elementType: 'text', locked: element.locked });
      this.applyObjectLock(text, element.locked);
      this.canvas.add(text);
      return;
    }
    if (element.type === 'sticker') {
      const sticker = new Textbox(properties.text || '✨', { ...properties, fontSize: 54, elementType: 'sticker', locked: element.locked });
      this.applyObjectLock(sticker, element.locked);
      this.canvas.add(sticker);
      return;
    }
    if (element.type === 'shape') {
      const shape = new Rect({ fill: '#e7b66b', rx: 14, ry: 14, ...properties, elementType: 'shape', locked: element.locked });
      this.applyObjectLock(shape, element.locked);
      this.canvas.add(shape);
      return;
    }
    if (element.type === 'doodle' && properties.path) {
      const doodle = new Path(properties.path, { ...properties, elementType: 'doodle', locked: element.locked });
      doodle.doodleColor = properties.doodleColor || properties.stroke || this.doodleColor;
      this.applyObjectLock(doodle, element.locked);
      this.canvas.add(doodle);
    }
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
    return this.canvas.getObjects().map((object, index) => ({
      type: object.elementType || (object.path ? 'doodle' : 'shape'),
      photoId: object.photoId || null,
      zIndex: index,
      locked: object.locked === true,
      properties: {
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
      },
    }));
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
    const text = new Textbox('Write a memory', { left: 200, top: 160, fontSize: 34, fill: '#2f241e', elementType: 'text', width: 300 });
    this.canvas.add(text);
    this.canvas.setActiveObject(text);
    this.recordHistory();
  }

  addSticker(sticker) {
    if (!this.canvas || this.activePage?.isLocked) return;
    const text = new Textbox(sticker, { left: 260, top: 220, fontSize: 64, elementType: 'sticker', width: 100 });
    this.canvas.add(text);
    this.canvas.setActiveObject(text);
    this.recordHistory();
  }

  applyObjectLock(object, locked) {
    object.locked = locked === true;
    object.set({
      lockMovementX: object.locked,
      lockMovementY: object.locked,
      lockScalingX: object.locked,
      lockScalingY: object.locked,
      lockRotation: object.locked,
    });
  }

  toggleElementLock() {
    const object = this.getSelectedObject();
    if (!object || this.activePage?.isLocked) return;
    this.applyObjectLock(object, !object.locked);
    this.canvas.requestRenderAll();
    this.recordHistory();
  }

  fitCanvas() {
    if (!this.canvas) return;
    const stage = this.$('.scrapbook-canvas-stage');
    if (!stage) return;
    const availableWidth = Math.max(280, stage.clientWidth - 16);
    this.canvas.setZoom(Math.min(1, availableWidth / (this.activePage.canvasWidth || 1200)));
    this.canvas.requestRenderAll();
  }

  getSelectedObject() {
    return this.canvas?.getActiveObject() || null;
  }

  toggleDrawing() {
    if (!this.canvas || this.activePage?.isLocked) return;
    this.setEditorMode(this.editorMode === 'draw' ? 'select' : 'draw');
  }

  setEditorMode(mode) {
    if (!this.canvas || this.activePage?.isLocked) return;
    this.editorMode = mode;
    this.isDrawing = mode === 'draw';
    this.canvas.isDrawingMode = this.isDrawing;
    this.canvas.selection = mode === 'select';
    this.canvas.skipTargetFind = mode === 'hand' || mode === 'draw';
    this.canvas.setCursor(mode === 'hand' ? 'grab' : mode === 'draw' ? 'crosshair' : 'default');
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
    const object = this.getSelectedObject();
    if (!object || object.elementType !== 'photo' || this.activePage?.isLocked) return;
    this.applyFilterToObject(object, filterStyle);
    this.canvas.requestRenderAll();
    this.recordHistory();
  }

  applyTornToObject(object) {
    const width = object.width || 300;
    const height = object.height || 220;
    object.clipStyle = 'torn';
    object.clipPath = new Polygon([
      { x: -width / 2, y: -height / 2 },
      { x: -width / 4, y: -height / 2 + 8 },
      { x: 0, y: -height / 2 - 5 },
      { x: width / 4, y: -height / 2 + 7 },
      { x: width / 2, y: -height / 2 },
      { x: width / 2, y: height / 2 },
      { x: 0, y: height / 2 - 7 },
      { x: -width / 2, y: height / 2 },
    ], { originX: 'center', originY: 'center' });
  }

  applyTornEdge() {
    const object = this.getSelectedObject();
    if (!object || object.elementType !== 'photo' || this.activePage?.isLocked) return;
    this.applyTornToObject(object);
    this.canvas.requestRenderAll();
    this.recordHistory();
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

  deleteSelected() {
    const object = this.getSelectedObject();
    if (!object || this.activePage?.isLocked) return;
    this.canvas.remove(object);
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
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
          <div class="scrapbook-rail-header"><div><p class="scrapbook-kicker">Album studio</p><h2>Scrapbooks</h2></div><button class="btn-create-scrapbook icon-button" aria-label="Create scrapbook" title="Create scrapbook"><i data-lucide="plus"></i></button></div>
          <div class="scrapbook-page-list">
            ${this.pages.length ? this.pages.map((page) => `<button class="btn-select-scrapbook scrapbook-page-button ${this.activePage?.id === page.id ? 'is-active' : ''}" data-page-id="${page.id}"><span>${page.title}</span>${page.isLocked ? '<i data-lucide="lock" aria-label="Locked"></i>' : ''}</button>`).join('') : '<p class="scrapbook-empty-note">Create a page to start designing.</p>'}
          </div>
        </aside>

        <div class="scrapbook-editor-shell">
          ${this.activePage ? `
            <header class="scrapbook-editor-header">
              <div class="scrapbook-title-row"><input id="scrapbook-title" value="${this.activePage.title}" aria-label="Scrapbook title" ${this.activePage.isLocked ? 'disabled' : ''} /><button class="btn-save-scrapbook-title icon-button" aria-label="Save scrapbook title" title="Save title" ${this.activePage.isLocked ? 'disabled' : ''}><i data-lucide="check"></i></button><span class="scrapbook-save-status" aria-live="polite">Saved</span></div>
              <div class="scrapbook-editor-actions"><button class="btn-toggle-scrapbook-lock tool-button" title="${this.activePage.isLocked ? 'Unlock scrapbook' : 'Lock scrapbook'}"><i data-lucide="${this.activePage.isLocked ? 'lock-open' : 'lock'}"></i><span>${this.activePage.isLocked ? 'Unlock' : 'Lock'}</span></button><button class="btn-delete-scrapbook tool-button is-danger" title="Delete scrapbook"><i data-lucide="trash-2"></i><span>Delete</span></button></div>
            </header>
            <div class="scrapbook-tool-row">
              <div class="scrapbook-tool-group"><strong>Insert</strong><button class="btn-add-text tool-button" ${this.activePage.isLocked ? 'disabled' : ''}><i data-lucide="type"></i><span>Text</span></button><button class="btn-add-sticker tool-button" data-sticker="✨" ${this.activePage.isLocked ? 'disabled' : ''}><span aria-hidden="true">✨</span><span>Sticker</span></button><button class="btn-add-sticker tool-button" data-sticker="❤️" ${this.activePage.isLocked ? 'disabled' : ''}><span aria-hidden="true">❤️</span><span>Sticker</span></button></div>
              <div class="scrapbook-tool-group"><strong>Style</strong><button class="btn-apply-filter tool-button" data-filter="grayscale" ${this.activePage.isLocked ? 'disabled' : ''}>Mono</button><button class="btn-apply-filter tool-button" data-filter="sepia" ${this.activePage.isLocked ? 'disabled' : ''}>Sepia</button><button class="btn-apply-torn tool-button" ${this.activePage.isLocked ? 'disabled' : ''}>Torn edge</button></div>
              <div class="scrapbook-tool-group"><strong>Arrange</strong><button class="btn-undo-element tool-button" ${this.activePage.isLocked ? 'disabled' : ''} title="Undo"><i data-lucide="undo-2"></i></button><button class="btn-redo-element tool-button" ${this.activePage.isLocked ? 'disabled' : ''} title="Redo"><i data-lucide="redo-2"></i></button><button class="btn-toggle-element-lock tool-button" ${this.activePage.isLocked ? 'disabled' : ''} title="Lock or unlock selected element"><i data-lucide="lock-keyhole"></i><span>Lock element</span></button><button class="btn-duplicate-element tool-button" ${this.activePage.isLocked ? 'disabled' : ''}><i data-lucide="copy"></i><span>Duplicate</span></button><button class="btn-move-layer tool-button" data-direction="up" ${this.activePage.isLocked ? 'disabled' : ''}>Bring forward</button><button class="btn-delete-element tool-button is-danger" ${this.activePage.isLocked ? 'disabled' : ''}><i data-lucide="trash-2"></i><span>Delete</span></button></div>
              <div class="scrapbook-tool-group editor-mode-group"><strong>Mode</strong><button class="btn-editor-mode tool-button is-active" data-mode="select" ${this.activePage.isLocked ? 'disabled' : ''} title="Select and edit elements"><i data-lucide="mouse-pointer-2"></i><span>Select</span></button><button class="btn-editor-mode tool-button" data-mode="hand" ${this.activePage.isLocked ? 'disabled' : ''} title="Pan the canvas"><i data-lucide="hand"></i><span>Hand</span></button><button class="btn-editor-mode tool-button" data-mode="draw" ${this.activePage.isLocked ? 'disabled' : ''} title="Draw on the canvas"><i data-lucide="pen-line"></i><span>Draw</span></button></div>
              <div class="scrapbook-tool-group doodle-color-group"><strong>Doodle color</strong>${['#c85a32', '#2f6f8f', '#6b4f8a', '#3f9b69', '#d69b3d', '#24201d'].map((color) => `<button class="btn-doodle-color color-swatch ${this.doodleColor === color ? 'is-active' : ''}" data-color="${color}" style="--swatch-color: ${color}" aria-label="Choose doodle color ${color}" title="Choose doodle color"></button>`).join('')}</div>
              <div class="scrapbook-tool-group"><strong>Layouts</strong>${TEMPLATES.map((template) => `<button class="btn-apply-template tool-button" data-template="${template.id}" ${this.activePage.isLocked ? 'disabled' : ''}>${template.label}</button>`).join('')}</div>
              <span class="scrapbook-revision">Revision ${this.activePage.revision}</span>
            </div>
            <div class="scrapbook-canvas-stage ${this.activePage.background}"><canvas id="scrapbook-canvas"></canvas></div>
            <section class="scrapbook-photo-picker"><div class="picker-heading"><div><h3>Add photos from gallery</h3><p>Select photos to place on this page. They remain available in Gallery.</p></div><button class="btn-add-selected-photos tool-button" ${this.activePage.isLocked ? 'disabled' : ''}><i data-lucide="image-plus"></i><span>Add selected</span></button></div><div class="picker-grid">${this.photos.map((photo) => `<label class="picker-photo"><input class="scrapbook-photo-picker" type="checkbox" value="${photo.id}" ${this.activePage.isLocked ? 'disabled' : ''}><img src="${photo.r2Url}" alt="${photo.caption || 'Album photo'}" loading="lazy"></label>`).join('')}</div></section>
          ` : `<div class="scrapbook-empty-state"><i data-lucide="layout-template"></i><h2>Your album can hold many scrapbooks</h2><p>Create a page for the trip cover, a birthday spread, or any memory collection.</p><button class="btn-create-scrapbook tool-button"><i data-lucide="plus"></i><span>Create first scrapbook</span></button></div>`}
        </div>
      </section>
    `;
  }
}
