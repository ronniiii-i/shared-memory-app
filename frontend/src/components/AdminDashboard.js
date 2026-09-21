import { UIComponent } from '../core/UIComponent.js';
import { api } from '../services/api.js';
import { toast } from './Toast.js';
import { confirmDialog } from './ConfirmDialog.js';

export class AdminDashboard extends UIComponent {
  constructor(props) {
    super(props);
    this.albums = [];
    this.selectedAlbum = null;
  }

  async onMount() {
    await this.fetchAdminAlbums();

    this.delegate('click', '.btn-select-album', (e, target) => {
      const albumId = target.dataset.albumId;
      this.loadAlbumDetails(albumId);
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
  }

  async fetchAdminAlbums() {
    try {
      const allAlbums = await api.get('/albums');
      this.albums = allAlbums.filter((a) => a.role === 'admin');
      if (this.albums.length > 0) {
        await this.loadAlbumDetails(this.albums[0].id);
      } else {
        this.update();
      }
    } catch (err) {
      console.warn('Could not fetch admin albums:', err.message);
    }
  }

  async loadAlbumDetails(albumId) {
    try {
      this.selectedAlbum = await api.get(`/albums/${albumId}`);
      this.update();
    } catch (err) {
      toast.error(`Error loading album details: ${err.message}`);
    }
  }

  async removeMember(memberId) {
    if (!this.selectedAlbum) return;
    if (!await confirmDialog({ title: 'Revoke guest access?', message: 'This member will no longer be able to access the album.', confirmLabel: 'Revoke access', destructive: true })) return;

    try {
      await api.delete(`/albums/${this.selectedAlbum.id}/members/${memberId}`);
      this.selectedAlbum.members = this.selectedAlbum.members.filter((m) => m.userId !== memberId);
      this.update();
    } catch (err) {
      toast.error(`Could not remove member: ${err.message}`);
    }
  }

  async deletePhoto(photoId) {
    if (!this.selectedAlbum) return;
    if (!await confirmDialog({ title: 'Delete this photo?', message: 'This removes the photo from the album for everyone.', confirmLabel: 'Delete photo', destructive: true })) return;

    try {
      await api.delete(`/photos/${photoId}`);
      this.selectedAlbum.photos = this.selectedAlbum.photos.filter((p) => p.id !== photoId);
      this.update();
    } catch (err) {
      toast.error(`Could not delete photo: ${err.message}`);
    }
  }

  async deleteAlbum() {
    if (!this.selectedAlbum) return;
    if (!await confirmDialog({ title: 'Delete this album permanently?', message: `"${this.selectedAlbum.title}" and its contents cannot be recovered.`, confirmLabel: 'Delete album', destructive: true })) return;

    try {
      await api.delete(`/albums/${this.selectedAlbum.id}`);
      toast.success('Album deleted.');
      await this.fetchAdminAlbums();
    } catch (err) {
      toast.error(`Could not delete album: ${err.message}`);
    }
  }

  render() {
    if (this.albums.length === 0) {
      return `
        <div class="max-w-4xl mx-auto my-12 px-6">
          <h1 class="text-3xl font-extrabold text-white mb-6 font-heading flex items-center gap-2">
            <i data-lucide="shield" class="w-7 h-7 text-purple-400"></i>
            <span>Admin Dashboard</span>
          </h1>
          <div class="glass-panel p-12 rounded-3xl border border-slate-800 text-center text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center mx-auto mb-4 border border-purple-500/30">
              <i data-lucide="folder" class="w-8 h-8"></i>
            </div>
            <p class="text-sm">You don't currently admin any albums. Create an album to manage it here!</p>
          </div>
        </div>
      `;
    }

    const current = this.selectedAlbum;

    return `
      <div class="max-w-6xl mx-auto my-10 px-6">
        <h1 class="text-3xl font-extrabold text-white font-heading mb-8 flex items-center gap-3">
          <i data-lucide="shield" class="w-8 h-8 text-purple-400"></i>
          <span>Album Admin Dashboard</span>
        </h1>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <!-- Album Selector List -->
          <div class="lg:col-span-1 glass-panel p-4 rounded-3xl border border-slate-800 h-fit">
            <h3 class="text-[11px] font-bold uppercase text-slate-400 mb-3 tracking-wider px-2">Your Managed Albums</h3>
            <div class="space-y-2">
              ${this.albums.map((a) => `
                <button data-album-id="${a.id}" class="btn-select-album w-full text-left p-3 rounded-2xl transition-all cursor-pointer text-xs font-semibold flex items-center justify-between ${current?.id === a.id ? 'bg-purple-600/30 border border-purple-500/50 text-purple-300' : 'hover:bg-slate-800/60 text-slate-300'}" aria-label="Select album ${a.title}">
                  <span class="truncate">${a.title}</span>
                  <i data-lucide="chevron-right" class="w-4 h-4 opacity-60"></i>
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Album Admin Detail Panel -->
          ${current ? `
            <div class="lg:col-span-3 space-y-6">
              <!-- Controls Header -->
              <div class="glass-panel p-6 rounded-3xl border border-slate-800 flex items-center justify-between">
                <div>
                  <h2 class="text-xl font-bold text-white font-heading">${current.title}</h2>
                  <p class="text-xs text-slate-400 mt-1">Share Code: <span class="font-mono text-purple-400">${current.shareCode}</span></p>
                </div>
                <button class="btn-delete-album px-4 py-2.5 bg-red-600/90 hover:bg-red-600 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors shadow-lg flex items-center gap-1.5" aria-label="Delete album">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                  <span>Delete Album</span>
                </button>
              </div>

              <!-- Members Table -->
              <div class="glass-panel p-6 rounded-3xl border border-slate-800">
                <h3 class="font-bold text-sm text-white mb-4 flex items-center gap-2 font-heading">
                  <i data-lucide="users" class="w-4 h-4 text-purple-400"></i>
                  <span>Members (${current.members?.length || 0})</span>
                </h3>

                <div class="divide-y divide-slate-800">
                  ${(current.members || []).map((m) => `
                    <div class="py-3 flex items-center justify-between text-xs">
                      <div class="flex items-center gap-3">
                        <img src="${m.user?.avatarUrl || 'https://api.dicebear.com/9.x/avataaars/svg?seed=' + m.user?.username}" class="w-8 h-8 rounded-full border border-purple-500/30" />
                        <div>
                          <span class="font-semibold text-slate-200">@${m.user?.username || m.userId}</span>
                          <span class="ml-2 px-2 py-0.5 rounded bg-slate-800 text-[10px] uppercase font-bold text-purple-400 border border-purple-500/20">${m.role}</span>
                        </div>
                      </div>

                      ${m.role !== 'admin' ? `
                        <button data-member-id="${m.userId}" class="btn-remove-member px-3 py-1.5 bg-red-900/30 hover:bg-red-900/60 text-red-300 font-semibold rounded-xl cursor-pointer transition-colors flex items-center gap-1" aria-label="Revoke access">
                          <i data-lucide="user-x" class="w-3.5 h-3.5"></i>
                          <span>Revoke Access</span>
                        </button>
                      ` : '<span class="text-slate-500 italic text-[11px]">Owner</span>'}
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Photos Moderation -->
              <div class="glass-panel p-6 rounded-3xl border border-slate-800">
                <h3 class="font-bold text-sm text-white mb-4 flex items-center gap-2 font-heading">
                  <i data-lucide="image" class="w-4 h-4 text-purple-400"></i>
                  <span>Photos Moderation (${current.photos?.length || 0})</span>
                </h3>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                  ${(current.photos || []).map((p) => `
                    <div class="relative group rounded-2xl overflow-hidden border border-slate-800">
                      <img src="${p.r2Url}" class="w-full h-32 object-cover" />
                      <button data-photo-id="${p.id}" class="btn-delete-photo-admin absolute inset-0 bg-red-950/80 text-white font-bold text-xs opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer gap-1.5" aria-label="Remove photo">
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
}
