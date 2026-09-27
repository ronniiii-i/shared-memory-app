import { UIComponent } from '../core/UIComponent.js';
import { api } from '../services/api.js';
import { toast } from './Toast.js';
import { doodleLayer, doodle } from './Doodles.js';

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
        <div class="memora-page memora-wash">
          <div class="memora-empty memora-reveal">
            <div class="memora-empty-mark memora-empty-mark-warn"><i data-lucide="alert-triangle" aria-hidden="true"></i></div>
            <h3>This invite link has gone cold</h3>
            <p>${this.error}</p>
            <a href="#/" class="memora-button memora-empty-action">Go to home</a>
          </div>
        </div>
      `;
    }

    if (!this.album) {
      return `
        <div class="memora-page memora-wash">
          <div class="loader-spinner" style="margin: 6rem auto;">
            <div class="spinner-ring"></div>
          </div>
        </div>
      `;
    }

    return `
      <div class="memora-page memora-wash">
        ${doodleLayer(
          [
            [doodle.leafSprig, { className: 'memora-doodle memora-doodle-size-lg memora-drift', style: 'top: 6%; left: -1.75rem;' }],
            [doodle.heartScribble, { className: 'memora-doodle memora-doodle-size-sm memora-float', style: 'bottom: 4%; right: 2%; --memora-tilt: 7deg;' }],
          ],
          'memora-doodles-leaf memora-doodles-faint'
        )}

        <section class="memora-panel memora-doodle-host max-w-md mx-auto memora-reveal">
          ${doodleLayer(
            [
              [doodle.scribbleUnderline, { className: 'memora-doodle memora-doodle-size-sm', style: 'bottom: -0.9rem; left: 12%; --memora-tilt: -2deg;' }],
            ],
            'memora-doodles-honey memora-doodles-faint'
          )}

          <div class="memora-panel-mark"><i data-lucide="camera" aria-hidden="true"></i></div>

          <h1 class="font-serif-heading text-2xl font-bold text-heading">You're invited.</h1>
          <p class="memora-sheet-copy" style="font-size: 0.85rem">Someone would like you to add your photographs to their album.</p>

          <div class="memora-sheet memora-sheet-flat" style="margin-top: 1.5rem; text-align: center">
            <h2 class="font-serif-heading text-xl font-bold text-heading">${this.album.title}</h2>
            ${
              this.album.description
                ? `<p class="memora-sheet-copy" style="margin-top: 0.4rem">${this.album.description}</p>`
                : ''
            }
          </div>

          <form id="join-form" class="memora-form" style="margin-top: 1.5rem">
            ${
              this.album.requiresPasscode
                ? `
              <div>
                <label for="passcode-input" class="memora-label">Passcode required</label>
                <input type="password" id="passcode-input" required placeholder="Enter the album passcode" class="memora-control memora-control-mono" />
              </div>
            `
                : ''
            }

            <button type="submit" class="memora-button memora-button-block">
              <i data-lucide="folder-plus" aria-hidden="true"></i>
              <span>${this.isJoining ? 'Joining…' : 'Join the scrapbook'}</span>
            </button>
          </form>
        </section>
      </div>
    `;
  }
}
