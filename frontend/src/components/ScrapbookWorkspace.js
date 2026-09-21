import { Canvas, FabricImage, Rect, Textbox, Polygon, filters } from 'fabric';
import { UIComponent } from '../core/UIComponent.js';
import { api } from '../services/api.js';
import { toast } from './Toast.js';
import { confirmDialog } from './ConfirmDialog.js';

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
    this.delegate('click', '.btn-apply-filter', (event, target) => this.applyFilter(target.dataset.filter));
    this.delegate('click', '.btn-apply-torn', () => this.applyTornEdge());
    this.delegate('click', '.btn-duplicate-element', () => this.duplicateSelected());
    this.delegate('click', '.btn-delete-element', () => this.deleteSelected());
    this.delegate('click', '.btn-move-layer', (event, target) => this.moveLayer(target.dataset.direction));

    if (!this._fetched) {
      this._fetched = true;
      await this.loadPages();
    }
  }

  onUnmount() {
    this._fetched = false;
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.canvas?.dispose();
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
    this.canvas.on('object:modified', () => this.scheduleSave());
    this.canvas.on('object:added', () => this.scheduleSave());

    for (const element of this.activePage.elements || []) {
      await this.restoreElement(element);
    }
    this.canvas.requestRenderAll();
    this.fitCanvas();
  }

  async restoreElement(element) {
    const properties = element.properties || {};
    if (element.type === 'photo' && properties.src) {
      const image = await FabricImage.fromURL(properties.src, { crossOrigin: 'anonymous' });
      image.set({ ...properties, photoId: element.photoId, elementType: 'photo', locked: element.locked });
      if (properties.filterStyle) this.applyFilterToObject(image, properties.filterStyle);
      if (properties.clipStyle === 'torn') this.applyTornToObject(image);
      this.canvas.add(image);
      return;
    }
    if (element.type === 'text') {
      const text = new Textbox(properties.text || 'Your memory', { ...properties, elementType: 'text', locked: element.locked });
      this.canvas.add(text);
      return;
    }
    if (element.type === 'sticker') {
      const sticker = new Textbox(properties.text || '✨', { ...properties, fontSize: 54, elementType: 'sticker', locked: element.locked });
      this.canvas.add(sticker);
      return;
    }
    if (element.type === 'shape') {
      const shape = new Rect({ fill: '#e7b66b', rx: 14, ry: 14, ...properties, elementType: 'shape', locked: element.locked });
      this.canvas.add(shape);
    }
  }

  scheduleSave() {
    if (!this.activePage || this.activePage.isLocked) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveCanvas(), 700);
  }

  async saveCanvas() {
    if (!this.canvas || !this.activePage || this.activePage.isLocked) return;
    this.isSaving = true;
    this.updateSaveStatus();

    const objects = this.canvas.getObjects();
    const elements = objects.map((object, index) => {
      const type = object.elementType || 'shape';
      const properties = object.toObject([
        'left', 'top', 'scaleX', 'scaleY', 'angle', 'width', 'height', 'fill',
        'fontSize', 'fontFamily', 'text', 'src', 'opacity', 'flipX', 'flipY',
        'filterStyle', 'clipStyle',
      ]);
      return {
        type,
        photoId: object.photoId || null,
        zIndex: index,
        locked: object.locked === true,
        properties,
      };
    });

    try {
      const saved = await api.put(`/scrapbooks/${this.activePage.id}/elements`, {
        revision: this.activePage.revision,
        elements,
      });
      this.activePage = saved;
      this.pages = this.pages.map((page) => page.id === saved.id ? saved : page);
      this.isSaving = false;
      this.updateSaveStatus('Saved');
    } catch (err) {
      this.isSaving = false;
      this.updateSaveStatus('Save failed');
      toast.error(`Could not save scrapbook: ${err.message}`);
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
      const image = await FabricImage.fromURL(photo.r2Url, { crossOrigin: 'anonymous' });
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
    this.scheduleSave();
  }

  addSticker(sticker) {
    if (!this.canvas || this.activePage?.isLocked) return;
    const text = new Textbox(sticker, { left: 260, top: 220, fontSize: 64, elementType: 'sticker', width: 100 });
    this.canvas.add(text);
    this.canvas.setActiveObject(text);
    this.scheduleSave();
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
    this.isDrawing = !this.isDrawing;
    this.canvas.isDrawingMode = this.isDrawing;
    this.canvas.freeDrawingBrush.width = 5;
    this.canvas.freeDrawingBrush.color = '#c85a32';
    const button = this.$('.btn-toggle-drawing');
    if (button) button.classList.toggle('is-active', this.isDrawing);
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
    this.scheduleSave();
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
    this.scheduleSave();
  }

  async duplicateSelected() {
    const object = this.getSelectedObject();
    if (!object || this.activePage?.isLocked) return;
    const copy = await object.clone(['photoId', 'elementType', 'src', 'locked', 'filterStyle', 'clipStyle']);
    copy.set({ left: (object.left || 0) + 24, top: (object.top || 0) + 24 });
    this.canvas.add(copy);
    this.canvas.setActiveObject(copy);
    this.scheduleSave();
  }

  deleteSelected() {
    const object = this.getSelectedObject();
    if (!object || this.activePage?.isLocked) return;
    this.canvas.remove(object);
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.scheduleSave();
  }

  moveLayer(direction) {
    const object = this.getSelectedObject();
    if (!object || this.activePage?.isLocked) return;
    if (direction === 'up') this.canvas.bringObjectForward(object);
    else this.canvas.sendObjectBackwards(object);
    this.canvas.requestRenderAll();
    this.scheduleSave();
  }

  applyTemplate(templateId) {
    if (!this.activePage || this.activePage.isLocked) return;
    const template = TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    api.patch(`/scrapbooks/${this.activePage.id}`, { template: template.id, background: template.background })
      .then((updated) => {
        this.activePage = { ...this.activePage, ...updated };
        this.pages = this.pages.map((page) => page.id === updated.id ? this.activePage : page);
        this.update();
        this.mountCanvas();
        toast.success(`${template.label} applied.`);
      })
      .catch((err) => toast.error(`Could not apply template: ${err.message}`));
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
              <div class="scrapbook-tool-group"><strong>Arrange</strong><button class="btn-duplicate-element tool-button" ${this.activePage.isLocked ? 'disabled' : ''}><i data-lucide="copy"></i><span>Duplicate</span></button><button class="btn-move-layer tool-button" data-direction="up" ${this.activePage.isLocked ? 'disabled' : ''}>Bring forward</button><button class="btn-delete-element tool-button is-danger" ${this.activePage.isLocked ? 'disabled' : ''}><i data-lucide="trash-2"></i><span>Delete</span></button></div>
              <div class="scrapbook-tool-group"><button class="btn-toggle-drawing tool-button" ${this.activePage.isLocked ? 'disabled' : ''}><i data-lucide="pen-line"></i><span>Doodle</span></button></div>
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
