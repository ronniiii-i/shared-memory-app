import { UIComponent } from '../core/UIComponent.js';
import { ScrapbookWorkspace } from './ScrapbookWorkspace.js';
import { PhotoGallery } from './PhotoGallery.js';
import { PhotoUploader } from './PhotoUploader.js';
import { GuestInvite } from './GuestInvite.js';
import { VibeSummary } from './VibeSummary.js';
import { api } from '../services/api.js';
import { normalizeShareCode } from '../services/shareCode.js';
import { subscribeToAlbum } from '../services/pusher.js';
import { store } from '../core/Store.js';
import { toast } from './Toast.js';
import { confirmDialog } from './ConfirmDialog.js';
import { doodleLayer, doodle } from './Doodles.js';

export class ScrapbookView extends UIComponent {
  constructor(props) {
    super(props);
    this.albumId = props.params.id;
    this.album = null;
    this.photos = [];
    this.activeTab = 'gallery';
    this.unsubscribePusher = null;
    this._fetched = false;

    // Share-code editing (admin only). `codeDraft` is null until the admin
    // starts editing, so the stored code shows untouched until then.
    this.codeDraft = null;
    this.codeError = '';
    this.isSavingCode = false;
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

    this.delegate('click', '.btn-edit-code', () => {
      this.codeDraft = this.album.shareCode;
      this.codeError = '';
      this.update();
    });

    this.delegate('click', '.btn-cancel-code', () => {
      this.codeDraft = null;
      this.codeError = '';
      this.update();
    });

    this.delegate('input', '#album-code-edit', (e, target) => {
      this.codeDraft = target.value;
      this.codeError = '';
    });

    this.delegate('submit', '#edit-code-form', (e) => this.handleSaveCode(e));

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

  /**
   * Change the album's share code. Every existing invite link stops working,
   * so the UI says so plainly before the save.
   */
  async handleSaveCode(e) {
    e.preventDefault();
    if (!this.album) return;

    const code = normalizeShareCode(this.codeDraft);

    if (code === normalizeShareCode(this.album.shareCode)) {
      this.codeDraft = null;
      this.codeError = '';
      this.update();
      return;
    }

    this.isSavingCode = true;
    this.codeError = '';
    this.update();

    try {
      const updated = await api.patch(`/albums/${this.album.id}`, { shareCode: code });
      this.album = { ...this.album, shareCode: updated.shareCode };
      this.codeDraft = null;
      toast.success('Share code updated.');
    } catch (err) {
      // 400 = unusable code, 409 = taken. Both keep the editor open.
      this.codeError = err.message;
    } finally {
      this.isSavingCode = false;
      this.update();
    }
  }

  renderShareCodeControl() {
    const stored = this.album.shareCode;
    const editing = this.codeDraft !== null;
    const preview = normalizeShareCode(this.codeDraft);

    if (!editing) {
      return `
        <div class="memora-code-row">
          <div>
            <p class="memora-kicker">Share code</p>
            <p class="memora-code memora-code-lg">${stored}</p>
            <p class="memora-field-hint">
              Friends join with this code or the invite link. Unique across every album.
            </p>
          </div>
          <button type="button" class="btn-edit-code memora-pill">
            <i data-lucide="pencil" aria-hidden="true"></i>
            <span>Change</span>
          </button>
        </div>
      `;
    }

    return `
      <form id="edit-code-form" class="memora-code-row">
        <div>
          <label for="album-code-edit" class="memora-kicker">Share code</label>
          <div class="memora-code-field">
            <input
              type="text"
              id="album-code-edit"
              value="${this.codeDraft}"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="characters"
              maxlength="24"
              aria-describedby="album-code-edit-hint"
              class="memora-control memora-control-mono memora-code-input${this.codeError ? ' memora-control-invalid' : ''}"
            />
          </div>
          <p id="album-code-edit-hint" class="memora-field-hint">
            ${
              this.codeError
                ? `<span class="memora-form-error" role="alert">${this.codeError}</span>`
                : `Saves as <span class="memora-code">${preview || '—'}</span>. <strong>Existing invite links will stop working.</strong>`
            }
          </p>
        </div>
        <div class="memora-code-row-actions">
          <button type="button" class="btn-cancel-code memora-pill memora-pill-quiet">Cancel</button>
          <button type="submit" class="memora-button memora-button-inline" ${this.isSavingCode ? 'disabled' : ''}>
            <i data-lucide="check" aria-hidden="true"></i>
            <span>${this.isSavingCode ? 'Saving…' : 'Save code'}</span>
          </button>
        </div>
      </form>
    `;
  }

  render() {
    if (!this.album) {
      return `
        <div class="memora-page memora-wash">
          <div class="loader-spinner" style="margin: 6rem auto;">
            <div class="spinner-ring"></div>
          </div>
        </div>
      `;
    }

    const isAdmin = this.album.currentUserRole === 'admin';
    const roleLabel =
      this.album.currentUserRole === 'admin' ? 'You keep this one' : 'Shared with you';

    const tab = (name, icon, label) => `
      <button
        data-tab="${name}"
        role="tab"
        aria-selected="${this.activeTab === name}"
        class="btn-tab memora-tab"
      >
        <i data-lucide="${icon}" aria-hidden="true"></i>
        <span>${label}</span>
      </button>
    `;

    return `
      <div class="memora-page memora-wash">
        ${doodleLayer(
          [
            [doodle.cameraDoodle, { className: 'memora-doodle memora-doodle-size-lg memora-drift', style: 'top: 0.5rem; right: 2%;' }],
            [doodle.wave, { className: 'memora-doodle memora-doodle-size-lg', style: 'bottom: 4rem; left: -4rem; --memora-tilt: -3deg;' }],
          ],
          'memora-doodles-faint'
        )}

        <div class="memora-album-head">
          <div class="memora-reveal">
            <div class="memora-crumbs">
              <a href="#/" class="memora-crumb-back" aria-label="Back to all albums">
                <i data-lucide="arrow-left" aria-hidden="true"></i>
                <span>All albums</span>
              </a>
              <span class="memora-album-role">${roleLabel}</span>
            </div>
            <h1>${this.album.title}</h1>
            ${
              this.album.description
                ? `<p class="memora-album-head-copy">${this.album.description}</p>`
                : ''
            }
          </div>

          <!-- Tab Navigation -->
          <div class="memora-tabset" role="tablist" aria-label="Album sections">
            ${tab('gallery', 'grid', 'Gallery')}
            ${tab('canvas', 'image', 'Canvas')}
            ${tab('upload', 'plus', 'Add photos')}
            ${tab('invite', 'share-2', 'Invite')}
            ${tab('vibe', 'sparkles', 'Recap')}
            ${isAdmin ? tab('settings', 'settings', 'Settings') : ''}
          </div>
        </div>

        <!-- Tab Body Content -->
        <div id="tab-content" role="tabpanel">
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
            <div class="memora-settings">
              <!-- Admin Header & Danger Zone -->
              <div class="memora-sheet memora-settings-head">
                <div>
                  <p class="memora-kicker">Album management</p>
                  <h3 class="memora-sheet-title">Looking after this album</h3>
                  <p class="memora-sheet-copy">Invite people, change the code, or clear it out.</p>
                </div>
                <button class="btn-delete-album memora-button memora-button-danger">
                  <i data-lucide="trash-2" aria-hidden="true"></i>
                  <span>Delete album</span>
                </button>
              </div>

              <!-- Share Code -->
              <div class="memora-sheet">
                ${this.renderShareCodeControl()}
              </div>

              <!-- Members Moderation -->
              <div class="memora-sheet">
                <h3 class="memora-sheet-title">
                  <i data-lucide="users" aria-hidden="true"></i>
                  <span>Album members (${this.album.members?.length || 0})</span>
                </h3>

                <div class="memora-roster">
                  ${(this.album.members || []).map((m) => `
                    <div class="memora-roster-row">
                      <div class="memora-roster-id">
                        <img
                          class="memora-roster-avatar"
                          src="${m.user?.avatarUrl || 'https://api.dicebear.com/9.x/avataaars/svg?seed=' + (m.user?.username || m.userId)}"
                          alt=""
                        />
                        <div>
                          <span class="memora-roster-name">@${m.user?.username || m.userId}</span>
                          <span class="memora-roster-role">${m.role}</span>
                        </div>
                      </div>

                      ${
                        m.role !== 'admin'
                          ? `
                        <button data-member-id="${m.userId}" class="btn-remove-member memora-pill memora-pill-danger">
                          <i data-lucide="user-x" aria-hidden="true"></i>
                          <span>Revoke access</span>
                        </button>
                      `
                          : '<span class="memora-roster-owner">Owner</span>'
                      }
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Photos Moderation -->
              <div class="memora-sheet">
                <h3 class="memora-sheet-title">
                  <i data-lucide="image" aria-hidden="true"></i>
                  <span>Photos in this album (${this.photos.length})</span>
                </h3>

                <div class="memora-moderation-grid">
                  ${this.photos.map((p) => `
                    <div class="memora-moderation-cell">
                      <img src="${p.r2Url}" alt="${p.caption || 'Album photo'}" loading="lazy" />
                      <button
                        data-photo-id="${p.id}"
                        class="btn-delete-photo-admin memora-moderation-hit"
                        aria-label="Remove photo"
                      >
                        <i data-lucide="trash-2" aria-hidden="true"></i>
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
