import { UIComponent } from '../core/UIComponent.js';
import { store } from '../core/Store.js';
import { api } from '../services/api.js';
import { normalizeShareCode, suggestShareCode, validateShareCode } from '../services/shareCode.js';
import { toast } from './Toast.js';
import { doodleLayer, doodle } from './Doodles.js';

export class AlbumList extends UIComponent {
  constructor(props) {
    super(props);
    this.albums = [];
    this.isCreating = false;
    this._fetched = false;
    this.isLoading = true;

    // 'create' | 'join' | null — which sheet, if any, is open
    this.sheet = null;
    this.createCode = suggestShareCode();
    this.createCodeError = '';
    // The sheets re-render wholesale, so every field they hold is mirrored in
    // state. Without this, a re-render (a taken code, a "Finding it…" spinner)
    // would silently wipe whatever the person had typed.
    this.createTitle = '';
    this.createDesc = '';
    this.createPass = '';
    this.joinInput = '';
    this.joinPass = '';
    this.joinError = '';
    this.joinNeedsPasscode = false;
    this.joinAlbumTitle = '';
    this.isJoining = false;
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
      this.sheet = 'create';
      this.createCode = suggestShareCode();
      this.createCodeError = '';
      this.createTitle = '';
      this.createDesc = '';
      this.createPass = '';
      this.update();
    });

    this.delegate('click', '.btn-open-join-modal', () => {
      if (!store.currentUser) {
        document.dispatchEvent(new CustomEvent('open-custom-auth', { detail: { tab: 'login' } }));
        return;
      }
      this.sheet = 'join';
      this.joinInput = '';
      this.joinPass = '';
      this.joinError = '';
      this.joinNeedsPasscode = false;
      this.joinAlbumTitle = '';
      this.update();
    });

    this.delegate('click', '.btn-close-sheet', () => this.closeSheet());

    // Live-preview the code as it is typed, and complain early if unusable.
    // The hint is patched in place rather than re-rendered, so typing does not
    // steal focus or reset the caret.
    this.delegate('input', '#album-code-input', (e, target) => {
      this.createCode = target.value;
      this.createCodeError = '';
      this.paintCodeHint();
    });

    this.delegate('input', '#album-title-input', (e, target) => {
      this.createTitle = target.value;
    });

    this.delegate('input', '#album-desc-input', (e, target) => {
      this.createDesc = target.value;
    });

    this.delegate('input', '#album-pass-input', (e, target) => {
      this.createPass = target.value;
    });

    this.delegate('input', '#join-code-input', (e, target) => {
      this.joinInput = target.value;
      this.joinError = '';
    });

    this.delegate('input', '#join-pass-input', (e, target) => {
      this.joinPass = target.value;
    });

    this.delegate('click', '.btn-roll-code', () => {
      this.createCode = suggestShareCode();
      this.createCodeError = '';
      this.update();
    });

    this.delegate('submit', '#create-album-form', (e) => this.handleCreateAlbum(e));
    this.delegate('submit', '#join-album-form', (e) => this.handleJoinAlbum(e));
  }

  closeSheet() {
    this.sheet = null;
    this.isJoining = false;
    this.update();
  }

  /**
   * What the code will be stored as, and whatever is wrong with it so far.
   * The server stays the authority on uniqueness — that is the one thing we
   * cannot know from here — but length and reserved words are checkable now.
   */
  codeHint() {
    const preview = normalizeShareCode(this.createCode);
    const localIssue = preview ? validateShareCode(this.createCode).error : '';
    return { preview, message: this.createCodeError || localIssue };
  }

  /** Repaint only the hint line, so typing does not re-render the whole sheet. */
  paintCodeHint() {
    const hint = this.$('#album-code-hint');
    const input = this.$('#album-code-input');
    if (!hint || !input) return;

    const { preview, message } = this.codeHint();
    hint.innerHTML = message
      ? `<span class="memora-form-error" role="alert">${message}</span>`
      : `Stored as <span class="memora-code">${preview || '—'}</span> — unique across every album.`;
    input.classList.toggle('memora-control-invalid', Boolean(message));
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

    if (!this.createTitle.trim()) return;

    const code = normalizeShareCode(this.createCode);

    // Length and reserved words are settled without a round trip.
    const checked = validateShareCode(this.createCode);
    if (checked.error) {
      this.createCodeError = checked.error;
      this.paintCodeHint();
      return;
    }

    try {
      const newAlbum = await api.post('/albums', {
        title: this.createTitle.trim(),
        description: this.createDesc.trim() || null,
        passcode: this.createPass.trim() || null,
        shareCode: code || undefined,
      });

      this.sheet = null;
      window.location.hash = `#/album/${newAlbum.id}`;
    } catch (err) {
      // A taken code is the one failure worth keeping the sheet open for.
      // Every field is already mirrored in state, so the re-render puts the
      // person's work back exactly as they left it.
      if (err.status === 409 || err.status === 400) {
        this.createCodeError = err.message;
        this.update();
        return;
      }
      toast.error(`Failed to create album: ${err.message}`);
    }
  }

  /**
   * Join by code in one step: look the album up first so we can show its
   * title (and ask for a passcode only if one is actually set), then join.
   */
  async handleJoinAlbum(e) {
    e.preventDefault();

    // `normalizeShareCode` also digs a code out of a pasted invite link, so
    // this covers "type the code" and "paste the whole link" in one step.
    const code = normalizeShareCode(this.joinInput);
    if (!code) {
      this.joinError = 'Enter the code from your invite.';
      this.update();
      return;
    }

    const passcode = this.joinPass || undefined;
    this.isJoining = true;
    this.joinError = '';
    this.update();

    try {
      const info = await api.get(`/albums/join/${encodeURIComponent(code)}`);

      if (info.requiresPasscode && !this.joinNeedsPasscode) {
        // First sighting of a protected album: reveal the passcode field and
        // wait, rather than bouncing to a separate page.
        this.joinNeedsPasscode = true;
        this.joinAlbumTitle = info.title;
        this.isJoining = false;
        this.update();
        return;
      }

      const res = await api.post(`/albums/join/${encodeURIComponent(code)}`, { passcode });

      this.sheet = null;
      window.location.hash = `#/album/${res.albumId}`;
    } catch (err) {
      this.isJoining = false;
      this.joinError = err.message;
      this.update();
    }
  }

  renderCreateModal() {
    const { preview, message: codeHint } = this.codeHint();

    return `
      <div role="dialog" aria-modal="true" aria-labelledby="modal-title" class="fixed inset-0 z-[9000] memora-modal-scrim">
        <div class="memora-modal memora-sheet memora-reveal is-revealed">
          <div class="memora-modal-head">
            <div>
              <p class="memora-kicker">A new memory</p>
              <h2 id="modal-title" class="memora-modal-title">Name the album</h2>
              <p class="memora-sheet-copy">Give it something you'll recognise in a year's time.</p>
            </div>
            <button type="button" class="btn-close-sheet memora-pill memora-pill-quiet" aria-label="Close">
              <i data-lucide="x" aria-hidden="true"></i>
            </button>
          </div>

          <form id="create-album-form" class="memora-form">
            <div>
              <label for="album-title-input" class="memora-label">Album title</label>
              <input type="text" id="album-title-input" value="${this.createTitle}" required placeholder="e.g. Summer Road Trip '26" class="memora-control" />
            </div>

            <div>
              <label for="album-desc-input" class="memora-label">A line about it <span class="memora-label memora-label-quiet">optional</span></label>
              <input type="text" id="album-desc-input" value="${this.createDesc}" placeholder="e.g. Good food, beach days, and sunsets" class="memora-control" />
            </div>

            <div>
              <label for="album-code-input" class="memora-label">
                Share code
                <span class="memora-label memora-label-quiet">friends type this to join</span>
              </label>
              <div class="memora-code-field">
                <input
                  type="text"
                  id="album-code-input"
                  value="${this.createCode}"
                  spellcheck="false"
                  autocapitalize="characters"
                  autocomplete="off"
                  maxlength="24"
                  aria-describedby="album-code-hint"
                  class="memora-control memora-control-mono memora-code-input${codeHint ? ' memora-control-invalid' : ''}"
                />
                <button type="button" class="btn-roll-code memora-pill memora-pill-quiet" aria-label="Suggest a different code">
                  <i data-lucide="refresh-cw" aria-hidden="true"></i>
                </button>
              </div>
              <p id="album-code-hint" class="memora-field-hint">
                ${
                  codeHint
                    ? `<span class="memora-form-error" role="alert">${codeHint}</span>`
                    : `Stored as <span class="memora-code">${preview}</span> — unique across every album.`
                }
              </p>
            </div>

            <div>
              <label for="album-pass-input" class="memora-label">A passcode, if it's just for friends <span class="memora-label memora-label-quiet">optional</span></label>
              <input type="text" id="album-pass-input" value="${this.createPass}" placeholder="e.g. vibe2026" class="memora-control memora-control-mono" />
            </div>

            <div class="memora-form-actions memora-modal-actions">
              <button type="button" class="btn-close-sheet memora-pill">Not yet</button>
              <button type="submit" class="memora-button memora-button-block memora-button-inline">
                <i data-lucide="plus" aria-hidden="true"></i>
                <span>Start the album</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  renderJoinModal() {
    return `
      <div role="dialog" aria-modal="true" aria-labelledby="join-modal-title" class="fixed inset-0 z-[9000] memora-modal-scrim">
        <div class="memora-modal memora-sheet memora-reveal is-revealed">
          <div class="memora-modal-head">
            <div>
              <p class="memora-kicker">You were invited</p>
              <h2 id="join-modal-title" class="memora-modal-title">Join an album</h2>
              <p class="memora-sheet-copy">Type the code you were sent, or paste the whole invite link.</p>
            </div>
            <button type="button" class="btn-close-sheet memora-pill memora-pill-quiet" aria-label="Close">
              <i data-lucide="x" aria-hidden="true"></i>
            </button>
          </div>

          <form id="join-album-form" class="memora-form">
            <div>
              <label for="join-code-input" class="memora-label">Album code</label>
              <input
                type="text"
                id="join-code-input"
                value="${this.joinInput}"
                placeholder="e.g. SUMMER26"
                spellcheck="false"
                autocomplete="off"
                autocapitalize="characters"
                aria-describedby="join-code-hint"
                class="memora-control memora-control-mono memora-code-input${this.joinError ? ' memora-control-invalid' : ''}"
              />
              <p id="join-code-hint" class="memora-field-hint">
                ${
                  this.joinError
                    ? `<span class="memora-form-error" role="alert">${this.joinError}</span>`
                    : 'Letters and numbers. We will find the album for you.'
                }
              </p>
            </div>

            ${
              this.joinNeedsPasscode
                ? `
              <div>
                <label for="join-pass-input" class="memora-label">
                  Passcode for “${this.joinAlbumTitle}”
                </label>
                <input type="password" id="join-pass-input" value="${this.joinPass}" placeholder="The passcode you were given" class="memora-control memora-control-mono" />
              </div>
            `
                : ''
            }

            <div class="memora-form-actions memora-modal-actions">
              <button type="button" class="btn-close-sheet memora-pill">Cancel</button>
              <button type="submit" class="memora-button memora-button-block memora-button-inline">
                <i data-lucide="folder-plus" aria-hidden="true"></i>
                <span>${this.isJoining ? 'Finding it…' : this.joinNeedsPasscode ? 'Join the album' : 'Find the album'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  renderAlbumCard(album, index) {
    return `
      <a
        href="#/album/${album.id}"
        class="memora-album-card memora-reveal"
        style="--memora-reveal-delay: ${60 + index * 70}ms"
        aria-label="Open album ${album.title}"
      >
        <div>
          <div class="memora-album-top">
            <h3 class="memora-album-title">${album.title}</h3>
            <span class="memora-album-role">${album.role === 'admin' ? 'Yours' : 'Shared with you'}</span>
          </div>
          ${
            album.description
              ? `<p class="memora-album-desc memora-album-clamp">${album.description}</p>`
              : `<p class="memora-album-desc memora-album-clamp">No description yet — the photographs will tell the story.</p>`
          }
        </div>

        <div class="memora-album-meta">
          <span class="memora-album-date">
            <i data-lucide="calendar" aria-hidden="true"></i>
            <span>${new Date(album.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
          </span>
          <span class="memora-album-cta">
            <span>Open</span>
            <i data-lucide="arrow-right" aria-hidden="true"></i>
          </span>
        </div>
      </a>
    `;
  }

  render() {
    if (this.isLoading) {
      return `
        <div class="memora-page memora-wash">
          <div class="loader-spinner" style="margin: 6rem auto;">
            <div class="spinner-ring"></div>
          </div>
        </div>
      `;
    }

    const hasAlbums = this.albums.length > 0;

    return `
      <div class="memora-dashboard memora-wash">
        ${doodleLayer(
          [
            [doodle.leafSprig, { className: 'memora-doodle memora-doodle-size-lg memora-drift', style: 'top: 1.5rem; right: 3%;' }],
            [doodle.squiggle, { className: 'memora-doodle memora-doodle-size-sm', style: 'top: 46%; left: -1.5rem; --memora-tilt: -6deg;' }],
            [doodle.paperCorner, { className: 'memora-doodle memora-doodle-size-sm memora-float', style: 'bottom: -1rem; right: 12%;' }],
          ],
          'memora-doodles-leaf memora-doodles-faint'
        )}

        <header class="memora-dash-header">
          <div class="memora-reveal">
            <p class="memora-eyebrow">Your memory shelf</p>
            <h1 class="memora-dash-title">A place for your people.</h1>
            <p class="memora-dash-copy">Keep the albums, inside jokes, and little stories you do not want to lose.</p>
          </div>

          <div class="memora-dash-actions memora-reveal" style="--memora-reveal-delay: 120ms">
            <button class="btn-open-join-modal memora-button memora-button-quiet">
              <i data-lucide="log-in" aria-hidden="true"></i>
              <span>Join album</span>
            </button>
            <button class="btn-open-create-modal memora-button">
              <i data-lucide="plus" aria-hidden="true"></i>
              <span>Make a new memory</span>
            </button>
          </div>
        </header>

        ${this.sheet === 'create' ? this.renderCreateModal() : ''}
        ${this.sheet === 'join' ? this.renderJoinModal() : ''}

        ${
          hasAlbums
            ? `
          <div class="memora-album-grid">
            ${this.albums.map((album, index) => this.renderAlbumCard(album, index)).join('')}
          </div>
        `
            : `
          <div class="memora-empty memora-reveal">
            <div class="memora-empty-mark"><i data-lucide="folder-open" aria-hidden="true"></i></div>
            <h3>Nothing on the shelf yet</h3>
            <p>Start an album of your own, or enter a friend's code to add your photographs to theirs.</p>
            <div class="memora-empty-actions">
              <button class="btn-open-create-modal memora-button memora-empty-action">
                <i data-lucide="plus" aria-hidden="true"></i>
                <span>Start the first one</span>
              </button>
              <button class="btn-open-join-modal memora-button memora-button-quiet memora-empty-action">
                <i data-lucide="log-in" aria-hidden="true"></i>
                <span>Join with a code</span>
              </button>
            </div>
          </div>
        `
        }
      </div>
    `;
  }
}
