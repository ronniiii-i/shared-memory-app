import { UIComponent } from '../core/UIComponent.js';
import { api } from '../services/api.js';
import { toast } from './Toast.js';

export class JoinAlbum extends UIComponent {
  constructor(props) {
    super(props);
    this.shareCode = props.params.code;
    this.album = null;
    this.error = null;
    this.isJoining = false;
    this._fetched = false;
  }

  async onMount() {
    if (!this._fetched) {
      this._fetched = true;
      this.fetchAlbumInfo();
    }
    this.delegate('submit', '#join-form', (e) => this.handleJoin(e));
  }

  onUnmount() {
    this._fetched = false;
  }

  async fetchAlbumInfo() {
    try {
      this.album = await api.get(`/albums/join/${this.shareCode}`);
      this.update();
    } catch (err) {
      this.error = err.message;
      this.update();
    }
  }

  async handleJoin(e) {
    e.preventDefault();
    const passInput = this.$('#passcode-input');
    const passcode = passInput ? passInput.value.trim() : null;

    this.isJoining = true;
    this.update();

    try {
      const res = await api.post(`/albums/join/${this.shareCode}`, { passcode });
      window.location.hash = `#/album/${res.albumId}`;
    } catch (err) {
      toast.error(`Could not join album: ${err.message}`);
      this.isJoining = false;
      this.update();
    }
  }

  render() {
    if (this.error) {
      return `
        <div class="max-w-md mx-auto my-20 glass-panel p-8 rounded-3xl border border-red-500/30 text-center">
          <div class="w-14 h-14 rounded-2xl bg-red-600/20 text-red-400 flex items-center justify-center mx-auto mb-4 border border-red-500/30">
            <i data-lucide="alert-triangle" class="w-7 h-7"></i>
          </div>
          <h2 class="text-xl font-bold text-white mb-2 font-heading">Invalid Invite Link</h2>
          <p class="text-xs text-slate-400 mb-6">${this.error}</p>
          <a href="#/" class="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl inline-block shadow-lg">
            Go to Home
          </a>
        </div>
      `;
    }

    if (!this.album) {
      return `
        <div class="flex items-center justify-center min-h-[60vh]">
          <div class="loader-spinner">
            <div class="spinner-ring"></div>
          </div>
        </div>
      `;
    }

    return `
      <div class="max-w-md mx-auto my-16 glass-panel p-8 rounded-3xl border border-slate-700 shadow-2xl">
        <div class="text-center mb-6">
          <div class="w-16 h-16 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center mx-auto mb-3 border border-purple-500/30">
            <i data-lucide="camera" class="w-8 h-8"></i>
          </div>
          <h1 class="text-2xl font-bold text-white font-heading">You're Invited!</h1>
          <p class="text-xs text-slate-400 mt-1">Join the shared photo album</p>
        </div>

        <div class="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 mb-6 text-center">
          <h2 class="text-lg font-bold text-purple-300 font-heading">${this.album.title}</h2>
          ${this.album.description ? `<p class="text-xs text-slate-400 mt-1.5 leading-relaxed">${this.album.description}</p>` : ''}
        </div>

        <form id="join-form" class="space-y-4">
          ${this.album.requiresPasscode ? `
            <div>
              <label for="passcode-input" class="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <i data-lucide="lock" class="w-4 h-4 text-purple-400"></i>
                <span>Passcode Required</span>
              </label>
              <input type="password" id="passcode-input" required placeholder="Enter album passcode" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-purple-500" />
            </div>
          ` : ''}

          <button type="submit" class="w-full py-3.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-sm rounded-xl shadow-lg cursor-pointer transition-transform hover:scale-[1.02] flex items-center justify-center gap-2">
            <i data-lucide="folder-plus" class="w-4 h-4"></i>
            <span>${this.isJoining ? 'Joining...' : 'Join Album Scrapbook'}</span>
          </button>
        </form>
      </div>
    `;
  }
}
