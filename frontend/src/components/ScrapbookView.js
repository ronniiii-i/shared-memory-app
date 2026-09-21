import { UIComponent } from '../core/UIComponent.js';
import { ScrapbookWorkspace } from './ScrapbookWorkspace.js';
import { PhotoGallery } from './PhotoGallery.js';
import { PhotoUploader } from './PhotoUploader.js';
import { GuestInvite } from './GuestInvite.js';
import { VibeSummary } from './VibeSummary.js';
import { api } from '../services/api.js';
import { subscribeToAlbum } from '../services/pusher.js';
import { store } from '../core/Store.js';
import { toast } from './Toast.js';
import { confirmDialog } from './ConfirmDialog.js';

export class ScrapbookView extends UIComponent {
  constructor(props) {
    super(props);
    this.albumId = props.params.id;
    this.album = null;
    this.photos = [];
    this.activeTab = 'gallery';
    this.unsubscribePusher = null;
    this._fetched = false;
  }

  async onMount() {
    if (!this._fetched) {
      this._fetched = true;
      await this.fetchData();
      this.setupPusher();
    }

    this.delegate('click', '.btn-tab', (e, target) => {
      this.activeTab = target.dataset.tab;
      this.update();
    });

    this.delegate('click', '.btn-remove-member', (e, target) => {
      const memberId = target.dataset.memberId;
      this.removeMember(memberId);
    });

    this.delegate('click', '.btn-delete-photo-admin', (e, target) => {
      const photoId = target.dataset.photoId;
      this.deletePhoto(photoId);
    });

    this.delegate('click', '.btn-delete-album', () => this.deleteAlbum());

    this.mountTabContent();
  }

  onUnmount() {
    this._fetched = false;
    if (this.unsubscribePusher) {
      this.unsubscribePusher();
    }
  }

  async fetchData() {
    try {
      this.album = await api.get(`/albums/${this.albumId}`);
      this.photos = await api.get(`/photos/${this.albumId}`);

      store.activeAlbumId = this.albumId;
      store.currentAlbumRole = this.album.currentUserRole;
      store.photos = this.photos;

      this.update();
    } catch (err) {
      toast.error(`Could not load album: ${err.message}`);
    }
  }

  setupPusher() {
    this.unsubscribePusher = subscribeToAlbum(this.albumId, {
      onPhotoAdded: (data) => {
        if (data.photo) {
          const photoExists = this.photos.some((p) => p.id === data.photo.id);
          if (!photoExists) {
            this.photos.unshift(data.photo);
            this.update();
          }
        }
      },
      onPhotoMoved: (data) => {
        if (data.photo) {
          const idx = this.photos.findIndex((p) => p.id === data.photo.id);
          if (idx !== -1) {
            this.photos[idx] = { ...this.photos[idx], ...data.photo };
            this.update();
          }
        }
      },
      onPhotoRemoved: (data) => {
        if (data.photoId) {
          this.photos = this.photos.filter((p) => p.id !== data.photoId);
          this.update();
        }
      },
    });
  }

  async removeMember(memberId) {
    if (!this.album) return;
    if (!await confirmDialog({ title: 'Revoke member access?', message: 'This member will no longer be able to access the album.', confirmLabel: 'Revoke access', destructive: true })) return;

    try {
      await api.delete(`/albums/${this.album.id}/members/${memberId}`);
      this.album.members = this.album.members.filter((m) => m.userId !== memberId);
      this.update();
    } catch (err) {
      toast.error(`Could not remove member: ${err.message}`);
    }
  }

  async deletePhoto(photoId) {
    if (!await confirmDialog({ title: 'Delete this photo?', message: 'This removes the photo from the album for everyone.', confirmLabel: 'Delete photo', destructive: true })) return;
    try {
      await api.delete(`/photos/${photoId}`);
      this.photos = this.photos.filter((p) => p.id !== photoId);
      this.update();
    } catch (err) {
      toast.error(`Could not delete photo: ${err.message}`);
    }
  }

  async deleteAlbum() {
    if (!await confirmDialog({ title: 'Delete this album permanently?', message: `"${this.album.title}" and its contents cannot be recovered.`, confirmLabel: 'Delete album', destructive: true })) return;
    try {
      await api.delete(`/albums/${this.album.id}`);
      window.location.hash = '#/';
    } catch (err) {
      toast.error(`Could not delete album: ${err.message}`);
    }
  }

  render() {
    if (!this.album) {
      return `
        <div class="flex items-center justify-center min-h-[70vh]">
          <div class="loader-spinner">
            <div class="spinner-ring"></div>
          </div>
        </div>
      `;
    }

    const isAdmin = this.album.currentUserRole === 'admin';

    return `
      <div class="max-w-7xl mx-auto px-6 py-8">
        <!-- Album Header -->
        <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-8">
          <div>
            <div class="flex items-center gap-3">
              <a href="#/" class="text-xs text-[var(--accent-sienna)] hover:underline flex items-center gap-1 font-semibold" aria-label="Back to all albums">
                <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>
                <span>All Albums</span>
              </a>
              <span class="text-xs text-muted">•</span>
              <span class="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-stone-200/60 dark:bg-stone-800 text-muted border border-[var(--border-color)]">
                ${this.album.currentUserRole}
              </span>
            </div>
            <h1 class="font-serif-heading text-3xl sm:text-4xl font-bold text-heading mt-2">${this.album.title}</h1>
            ${this.album.description ? `<p class="text-xs text-muted mt-1 font-sans leading-relaxed">${this.album.description}</p>` : ''}
          </div>

          <!-- Tab Navigation -->
          <div class="flex items-center gap-2 editorial-card p-1.5 rounded-2xl" role="tablist">
            <button data-tab="gallery" role="tab" aria-selected="${this.activeTab === 'gallery'}" class="btn-tab px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${this.activeTab === 'gallery' ? 'bg-[var(--accent-sienna)] text-white shadow' : 'text-muted hover:text-heading'}">
              <i data-lucide="grid" class="w-4 h-4"></i>
              <span>Gallery</span>
            </button>
            <button data-tab="canvas" role="tab" aria-selected="${this.activeTab === 'canvas'}" class="btn-tab px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${this.activeTab === 'canvas' ? 'bg-[var(--accent-sienna)] text-white shadow' : 'text-muted hover:text-heading'}">
              <i data-lucide="image" class="w-4 h-4"></i>
              <span>Canvas</span>
            </button>
            <button data-tab="upload" role="tab" aria-selected="${this.activeTab === 'upload'}" class="btn-tab px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${this.activeTab === 'upload' ? 'bg-[var(--accent-sienna)] text-white shadow' : 'text-muted hover:text-heading'}">
              <i data-lucide="plus" class="w-4 h-4"></i>
              <span>Add Photos</span>
            </button>
            <button data-tab="invite" role="tab" aria-selected="${this.activeTab === 'invite'}" class="btn-tab px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${this.activeTab === 'invite' ? 'bg-[var(--accent-sienna)] text-white shadow' : 'text-muted hover:text-heading'}">
              <i data-lucide="share-2" class="w-4 h-4"></i>
              <span>Invite</span>
            </button>
            <button data-tab="vibe" role="tab" aria-selected="${this.activeTab === 'vibe'}" class="btn-tab px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${this.activeTab === 'vibe' ? 'bg-[var(--accent-sienna)] text-white shadow' : 'text-muted hover:text-heading'}">
              <i data-lucide="sparkles" class="w-4 h-4"></i>
              <span>Recap</span>
            </button>
            ${isAdmin ? `
              <button data-tab="settings" role="tab" aria-selected="${this.activeTab === 'settings'}" class="btn-tab px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${this.activeTab === 'settings' ? 'bg-[var(--accent-sienna)] text-white shadow' : 'text-muted hover:text-heading'}">
                <i data-lucide="settings" class="w-4 h-4"></i>
                <span>Settings</span>
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Tab Body Content -->
        <div id="tab-content" class="mt-4" role="tabpanel">
          ${this.activeTab === 'gallery' ? `
            <div id="gallery-container"></div>
          ` : ''}

          ${this.activeTab === 'canvas' ? `
            <div id="scrapbook-container"></div>
          ` : ''}

          ${this.activeTab === 'upload' ? `
            <div id="uploader-container"></div>
          ` : ''}

          ${this.activeTab === 'invite' ? `
            <div id="invite-container"></div>
          ` : ''}

          ${this.activeTab === 'vibe' ? `
            <div id="vibe-container"></div>
          ` : ''}

          ${this.activeTab === 'settings' && isAdmin ? `
            <div class="space-y-6 max-w-3xl mx-auto">
              <!-- Admin Header & Danger Zone -->
              <div class="editorial-card p-6 rounded-3xl flex items-center justify-between">
                <div>
                  <h3 class="font-serif-heading text-lg font-bold text-heading">Album Management</h3>
                  <p class="text-xs text-muted mt-0.5">Share code: <span class="font-mono text-[var(--accent-sienna)] font-semibold">${this.album.shareCode}</span></p>
                </div>
                <button class="btn-delete-album px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl cursor-pointer shadow flex items-center gap-1.5">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                  <span>Delete Album</span>
                </button>
              </div>

              <!-- Members Moderation -->
              <div class="editorial-card p-6 rounded-3xl">
                <h3 class="font-serif-heading text-base font-bold text-heading mb-4 flex items-center gap-2">
                  <i data-lucide="users" class="w-4 h-4 text-[var(--accent-sienna)]"></i>
                  <span>Album Members (${this.album.members?.length || 0})</span>
                </h3>

                <div class="divide-y divide-[var(--border-color)]">
                  ${(this.album.members || []).map((m) => `
                    <div class="py-3 flex items-center justify-between text-xs">
                      <div class="flex items-center gap-3">
                        <img src="${m.user?.avatarUrl || 'https://api.dicebear.com/9.x/avataaars/svg?seed=' + m.user?.username}" class="w-8 h-8 rounded-full border border-[var(--border-color)] bg-stone-100" />
                        <div>
                          <span class="font-semibold text-main">@${m.user?.username || m.userId}</span>
                          <span class="ml-2 px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-[10px] uppercase font-bold text-muted">${m.role}</span>
                        </div>
                      </div>

                      ${m.role !== 'admin' ? `
                        <button data-member-id="${m.userId}" class="btn-remove-member px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-semibold rounded-xl cursor-pointer transition-colors flex items-center gap-1">
                          <i data-lucide="user-x" class="w-3.5 h-3.5"></i>
                          <span>Revoke Access</span>
                        </button>
                      ` : '<span class="text-muted italic text-[11px]">Owner</span>'}
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Photos Moderation -->
              <div class="editorial-card p-6 rounded-3xl">
                <h3 class="font-serif-heading text-base font-bold text-heading mb-4 flex items-center gap-2">
                  <i data-lucide="image" class="w-4 h-4 text-[var(--accent-sienna)]"></i>
                  <span>Photos Moderation (${this.photos.length})</span>
                </h3>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                  ${this.photos.map((p) => `
                    <div class="relative group rounded-xl overflow-hidden border border-[var(--border-color)]">
                      <img src="${p.r2Url}" class="w-full h-32 object-cover" />
                      <button data-photo-id="${p.id}" class="btn-delete-photo-admin absolute inset-0 bg-red-950/80 text-white font-bold text-xs opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer gap-1.5">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                        <span>Remove</span>
                      </button>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  onUpdate() {
    this.mountTabContent();
  }

  mountTabContent() {
    if (this.activeTab === 'canvas') {
      this.mountChild('workspace', new ScrapbookWorkspace({ albumId: this.albumId, photos: this.photos }), '#scrapbook-container');
    } else if (this.activeTab === 'gallery') {
      this.mountChild('gallery', new PhotoGallery({ photos: this.photos }), '#gallery-container');
    } else if (this.activeTab === 'upload') {
      this.mountChild('uploader', new PhotoUploader({
        albumId: this.albumId,
        onUploadComplete: (newPhoto) => {
          this.photos.unshift(newPhoto);
          this.activeTab = 'canvas';
          this.update();
        },
      }), '#uploader-container');
    } else if (this.activeTab === 'invite') {
      this.mountChild('invite', new GuestInvite({ album: this.album }), '#invite-container');
    } else if (this.activeTab === 'vibe') {
      this.mountChild('vibe', new VibeSummary({ photos: this.photos, albumTitle: this.album.title }), '#vibe-container');
    }
  }
}
