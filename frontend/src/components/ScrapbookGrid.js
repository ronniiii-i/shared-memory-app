import { UIComponent } from '../core/UIComponent.js';
import { PhotoCard } from './PhotoCard.js';
import { api } from '../services/api.js';

export class ScrapbookGrid extends UIComponent {
  constructor(props) {
    super(props);
    this.photos = props.photos || [];
    this.pendingLayoutUpdates = new Map();
    this.debounceTimer = null;
  }

  onMount() {
    this.renderPhotos();
  }

  onUpdate() {
    this.renderPhotos();
  }

  renderPhotos() {
    const canvas = this.$('.scrapbook-canvas');
    if (!canvas) return;

    canvas.innerHTML = '';

    if (this.photos.length === 0) {
      canvas.innerHTML = `
        <div class="flex flex-col items-center justify-center min-h-[450px] text-center text-slate-400">
          <div class="w-16 h-16 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center mb-4 border border-purple-500/30">
            <i data-lucide="image" class="w-8 h-8"></i>
          </div>
          <h3 class="font-heading font-bold text-xl text-white">No photos in this album yet</h3>
          <p class="text-xs text-slate-400 mt-1 max-w-sm">Click "Add Photos" above to start dropping polaroids onto your scrapbook canvas!</p>
        </div>
      `;
      this.refreshIcons();
      return;
    }

    this.photos.forEach((photo) => {
      const card = new PhotoCard({
        photo,
        onLayoutChange: (id, coords) => this.handleLayoutChange(id, coords),
        onDelete: (id) => this.handlePhotoDeleted(id),
      });

      const wrapper = document.createElement('div');
      canvas.appendChild(wrapper);
      card.mount(wrapper);
    });
  }

  handleLayoutChange(photoId, coords) {
    this.pendingLayoutUpdates.set(photoId, { id: photoId, ...coords });

    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.saveLayouts();
    }, 1000);
  }

  async saveLayouts() {
    if (this.pendingLayoutUpdates.size === 0) return;

    const updates = Array.from(this.pendingLayoutUpdates.values());
    this.pendingLayoutUpdates.clear();

    try {
      await api.patch('/photos/batch-layout', { updates });
    } catch (err) {
      console.warn('Failed to save layout updates:', err.message);
    }
  }

  handlePhotoDeleted(photoId) {
    this.photos = this.photos.filter((p) => p.id !== photoId);
    this.update();
  }

  render() {
    return `
      <div class="w-full relative overflow-hidden rounded-3xl border border-slate-800 shadow-2xl bg-slate-950/40">
        <div class="scrapbook-canvas p-6 min-h-[750px]">
          <!-- Photo Cards render here -->
        </div>
      </div>
    `;
  }
}
