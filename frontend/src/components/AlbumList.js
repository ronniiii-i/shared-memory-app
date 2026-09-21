import { UIComponent } from '../core/UIComponent.js';
import { store } from '../core/Store.js';
import { api } from '../services/api.js';
import { toast } from './Toast.js';

export class AlbumList extends UIComponent {
  constructor(props) {
    super(props);
    this.albums = [];
    this.isCreating = false;
    this._fetched = false;
    this.isLoading = true;
  }

  onUnmount() {
    this._fetched = false;
  }

  async onMount() {
    // Guard: fetchAlbums() is async and triggers update() which calls onMount() again.
    // Only fetch once per mount lifecycle.
    if (!this._fetched) {
      this._fetched = true;
      this.fetchAlbums();
    }

    this.delegate('click', '.btn-open-create-modal', () => {
      if (!store.currentUser) {
        document.dispatchEvent(new CustomEvent('open-custom-auth', { detail: { tab: 'register' } }));
        return;
      }
      this.isCreating = true;
      this.update();
    });

    this.delegate('click', '.btn-cancel-create', () => {
      this.isCreating = false;
      this.update();
    });

    this.delegate('submit', '#create-album-form', (e) => this.handleCreateAlbum(e));
  }

  async fetchAlbums() {
    try {
      this.albums = await api.get('/albums');
      store.albums = this.albums;
      this.isLoading = false;
      this.update();
    } catch (err) {
      console.warn('Could not fetch albums:', err.message);
      this.isLoading = false;
      this.update();
    }
  }

  async handleCreateAlbum(e) {
    e.preventDefault();
    const titleInput = this.$('#album-title-input');
    const descInput = this.$('#album-desc-input');
    const passInput = this.$('#album-pass-input');

    if (!titleInput || !titleInput.value.trim()) return;

    try {
      const newAlbum = await api.post('/albums', {
        title: titleInput.value.trim(),
        description: descInput ? descInput.value.trim() : null,
        passcode: passInput ? passInput.value.trim() : null,
      });

      this.isCreating = false;
      window.location.hash = `#/album/${newAlbum.id}`;
    } catch (err) {
      toast.error(`Failed to create album: ${err.message}`);
    }
  }

  render() {
    if (this.isLoading) {
      return `
        <div class="flex items-center justify-center min-h-[70vh]">
          <div class="loader-spinner">
            <div class="spinner-ring"></div>
          </div>
        </div>
      `;
    }

    return `
      <div class="memora-dashboard max-w-6xl mx-auto px-6 py-12">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10">
          <div>
            <p class="memora-eyebrow">Your memory shelf</p>
            <h1 class="font-serif-heading text-4xl font-bold text-heading tracking-tight">A place for your people.</h1>
            <p class="text-xs sm:text-sm text-muted mt-2">Keep the albums, inside jokes, and little stories you do not want to lose.</p>
          </div>

          <button class="btn-open-create-modal px-6 py-3 bg-[var(--accent-sienna)] hover:bg-[var(--accent-terracotta)] text-white font-semibold text-xs rounded-xl shadow cursor-pointer transition-all hover:scale-[1.02] flex items-center gap-2" aria-label="Create new album">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>Make a new memory</span>
          </button>
        </div>

        <!-- Create Album Modal -->
        ${this.isCreating ? `
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title" class="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div class="editorial-card p-8 rounded-3xl border border-[var(--border-color)] shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-150">
              <div class="flex items-center justify-between mb-6">
                <h2 id="modal-title" class="font-serif-heading text-2xl font-bold text-heading flex items-center gap-2">
                  <i data-lucide="folder" class="w-5 h-5 text-[var(--accent-sienna)]"></i>
                  <span>New Shared Album</span>
                </h2>
                <button type="button" class="btn-cancel-create p-2 text-muted hover:text-heading rounded-full bg-stone-200/50 dark:bg-stone-800/50 transition-colors" aria-label="Close modal">
                  <i data-lucide="x" class="w-4 h-4"></i>
                </button>
              </div>

              <form id="create-album-form" class="space-y-4">
                <div>
                  <label for="album-title-input" class="block text-xs font-semibold text-main mb-1.5">Album Title *</label>
                  <input type="text" id="album-title-input" required placeholder="e.g. Summer Road Trip '26" class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-xs text-main focus:outline-none focus:border-[var(--accent-sienna)] transition-all" />
                </div>

                <div>
                  <label for="album-desc-input" class="block text-xs font-semibold text-main mb-1.5">Description (Optional)</label>
                  <input type="text" id="album-desc-input" placeholder="e.g. Good food, beach days, and sunsets" class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-xs text-main focus:outline-none focus:border-[var(--accent-sienna)] transition-all" />
                </div>

                <div>
                  <label for="album-pass-input" class="block text-xs font-semibold text-main mb-1.5">Passcode Protection (Optional)</label>
                  <input type="text" id="album-pass-input" placeholder="e.g. vibe2026" class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-xs text-main focus:outline-none focus:border-[var(--accent-sienna)] transition-all" />
                </div>

                <div class="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
                  <button type="button" class="btn-cancel-create px-4 py-2.5 bg-stone-200 dark:bg-stone-800 text-main font-semibold text-xs rounded-xl cursor-pointer transition-colors">
                    Cancel
                  </button>
                  <button type="submit" class="px-5 py-2.5 bg-[var(--accent-sienna)] hover:bg-[var(--accent-terracotta)] text-white font-semibold text-xs rounded-xl cursor-pointer shadow transition-all hover:scale-105">
                    Create Album
                  </button>
                </div>
              </form>
            </div>
          </div>
        ` : ''}

        <!-- Album Grid -->
        ${this.albums.length === 0 ? `
          <div class="editorial-card p-12 rounded-3xl text-center max-w-lg mx-auto my-8">
            <div class="w-16 h-16 rounded-2xl bg-stone-200/60 dark:bg-stone-800 text-[var(--accent-sienna)] flex items-center justify-center mx-auto mb-4 border border-[var(--border-color)]">
              <i data-lucide="folder" class="w-8 h-8"></i>
            </div>
            <h3 class="font-serif-heading font-bold text-xl text-heading">No albums yet</h3>
            <p class="text-xs text-muted mt-1 mb-6">Create your first album or join a friend's album via invite code!</p>
            <button class="btn-open-create-modal px-6 py-3 bg-[var(--accent-sienna)] hover:bg-[var(--accent-terracotta)] text-white font-semibold text-xs rounded-xl cursor-pointer inline-flex items-center gap-2 shadow">
              <i data-lucide="plus" class="w-4 h-4"></i>
              <span>Create First Album</span>
            </button>
          </div>
        ` : `
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${this.albums.map((album) => `
              <a href="#/album/${album.id}" class="editorial-card p-6 rounded-3xl hover:border-[var(--accent-sienna)] transition-all hover:-translate-y-1 group flex flex-col justify-between" aria-label="Open album ${album.title}">
                <div>
                  <div class="flex items-start justify-between gap-2">
                    <h3 class="font-serif-heading font-bold text-xl text-heading group-hover:text-[var(--accent-sienna)] transition-colors">
                      ${album.title}
                    </h3>
                    <span class="px-2.5 py-0.5 rounded-full bg-stone-200/70 dark:bg-stone-800 text-muted text-[10px] font-semibold uppercase tracking-wider">
                      ${album.role || 'member'}
                    </span>
                  </div>

                  ${album.description ? `
                    <p class="text-xs text-muted mt-2 line-clamp-2 leading-relaxed font-sans">${album.description}</p>
                  ` : ''}
                </div>

                <div class="mt-8 pt-4 border-t border-[var(--border-color)] flex items-center justify-between text-xs text-muted">
                  <span class="flex items-center gap-1 font-mono text-[11px]">
                    <i data-lucide="calendar" class="w-3.5 h-3.5 text-[var(--accent-sienna)]"></i>
                    <span>${new Date(album.createdAt).toLocaleDateString()}</span>
                  </span>
                  <span class="text-[var(--accent-sienna)] group-hover:translate-x-1 transition-transform flex items-center gap-1 font-semibold text-xs">
                    <span>Open album</span>
                    <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                  </span>
                </div>
              </a>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }
}
