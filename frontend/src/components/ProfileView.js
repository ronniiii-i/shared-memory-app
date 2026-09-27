import { UIComponent } from '../core/UIComponent.js';
import { store } from '../core/Store.js';
import { api } from '../services/api.js';
import { compressImage } from '../services/compress.js';
import { toast } from './Toast.js';
import { doodleLayer, doodle } from './Doodles.js';

/** Avatars are shown small, so anything larger than this is wasted bytes. */
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export class ProfileView extends UIComponent {
  constructor(props) {
    super(props);
    this.user = store.currentUser;
    this.stats = { albumsCount: 0, photosCount: 0 };
    this.isEditing = false;
    this.message = '';
    this.error = '';
    this._fetched = false;

    this.avatarUploading = false;
    this.avatarError = '';
  }

  onUnmount() {
    this._fetched = false;
  }

  async onMount() {
    if (!this._fetched) {
      this._fetched = true;
      await this.fetchProfileData();
    }

    this.delegate('click', '.btn-toggle-edit', () => {
      this.isEditing = !this.isEditing;
      this.message = '';
      this.error = '';
      this.avatarError = '';
      this.update();
    });

    this.delegate('change', '#avatar-file-input', (e) => {
      const file = e.target.files?.[0];
      if (file) this.handleAvatarSelect(file);
    });

    this.delegate('submit', '#edit-profile-form', (e) => this.handleSaveProfile(e));
  }

  /**
   * Upload a chosen picture immediately, then persist the resulting URL.
   * Doing it on select (rather than on "Save changes") means the person sees
   * their new picture straight away and never has to paste a URL anywhere.
   */
  async handleAvatarSelect(file) {
    this.avatarError = '';

    if (!file.type.startsWith('image/')) {
      this.avatarError = 'That file is not an image.';
      this.update();
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      this.avatarError = 'That image is larger than 5 MB. Try a smaller one.';
      this.update();
      return;
    }

    this.avatarUploading = true;
    this.update();

    try {
      // An avatar is only ever shown small, so cap the long edge well below
      // the photo pipeline's 1920px.
      const compressed = await compressImage(file, {
        maxSizeMB: 0.4,
        maxWidthOrHeight: 512,
        initialQuality: 0.85,
      });

      const { uploadUrl, publicUrl } = await api.post('/upload/generate-url', {
        folder: 'avatars',
        filename: compressed.name,
        contentType: 'image/webp',
      });

      await api.uploadToPresignedUrl(uploadUrl, compressed, 'image/webp');

      const updated = await api.patch('/users/profile', { avatarUrl: publicUrl });

      this.user = { ...this.user, avatarUrl: updated.avatarUrl };
      if (store.currentUser) {
        store.currentUser = { ...store.currentUser, avatarUrl: updated.avatarUrl };
      }

      const input = this.$('#avatar-file-input');
      if (input) input.value = '';

      this.message = 'New picture saved.';
    } catch (err) {
      this.avatarError = err.message || 'Could not upload that picture.';
    } finally {
      this.avatarUploading = false;
      this.update();
    }
  }

  async fetchProfileData() {
    try {
      const data = await api.get('/users/me');
      this.user = data;
      this.stats = data.stats || { albumsCount: 0, photosCount: 0 };
      // Do NOT write to store.currentUser here — that triggers the Router's
      // stateChange listener which would unmount/remount this view (infinite loop).
      this.update();
    } catch (err) {
      console.warn('Could not fetch profile data:', err.message);
    }
  }

  async handleSaveProfile(e) {
    e.preventDefault();
    this.message = '';
    this.error = '';

    const nameInput = this.$('#edit-name-input');
    const currPassInput = this.$('#edit-curr-pass-input');
    const newPassInput = this.$('#edit-new-pass-input');

    const displayName = nameInput ? nameInput.value.trim() : undefined;
    const currentPassword = currPassInput ? currPassInput.value : undefined;
    const newPassword = newPassInput ? newPassInput.value : undefined;

    try {
      // The picture is already saved by handleAvatarSelect; this form only
      // handles the name and password.
      const updated = await api.patch('/users/profile', {
        displayName,
        currentPassword,
        newPassword,
      });

      this.user = updated;
      // Patch the store's currentUser in-place (displayName/avatarUrl only) so the
      // Navbar re-renders with the new name without triggering a full Router re-route.
      if (store.currentUser) {
        store.currentUser = { ...store.currentUser, displayName: updated.displayName, avatarUrl: updated.avatarUrl };
      }
      this.isEditing = false;
      this.message = 'Profile updated successfully!';
      this.update();
    } catch (err) {
      this.error = err.message || 'Failed to update profile.';
      this.update();
    }
  }

  render() {
    if (!this.user) {
      return `
        <div class="memora-page memora-wash">
          <div class="memora-empty memora-reveal">
            <div class="memora-empty-mark"><i data-lucide="user-round" aria-hidden="true"></i></div>
            <h3>Sign in to see your shelf</h3>
            <p>Your profile keeps your display name, your avatar, and a running count of everything you have shared.</p>
            <button class="memora-button memora-empty-action" onclick="document.dispatchEvent(new CustomEvent('open-custom-auth'))">
              <i data-lucide="log-in" aria-hidden="true"></i>
              <span>Sign in now</span>
            </button>
          </div>
        </div>
      `;
    }

    const { user, stats } = this;

    return `
      <div class="memora-page memora-wash">
        ${doodleLayer(
          [
            [doodle.squiggle, { className: 'memora-doodle memora-doodle-size-sm', style: 'top: 0.5rem; right: 6%; --memora-tilt: -5deg;' }],
            [doodle.leafSprig, { className: 'memora-doodle memora-doodle-size-md memora-drift', style: 'bottom: 8%; left: -1.5rem;' }],
          ],
          'memora-doodles-leaf memora-doodles-faint'
        )}

        <div class="memora-settings">
          <header class="memora-profile-card memora-sheet memora-reveal">
            <div class="memora-profile-id">
              <img
                class="memora-profile-avatar"
                src="${user.avatarUrl || 'https://api.dicebear.com/9.x/avataaars/svg?seed=' + user.username}"
                alt="${user.username}"
              />
              <div>
                <h1>${user.displayName || user.username}</h1>
                <p class="memora-profile-handle">@${user.username}</p>
                <p class="memora-profile-since">Keeping memories with Memora since ${new Date(user.createdAt || Date.now()).toLocaleDateString()}</p>
              </div>
            </div>

            <button class="btn-toggle-edit memora-button">
              <i data-lucide="${this.isEditing ? 'x' : 'edit-3'}" aria-hidden="true"></i>
              <span>${this.isEditing ? 'Cancel editing' : 'Edit profile'}</span>            </button>
          </header>

          ${this.message ? `
            <p class="memora-notice memora-notice-success" role="status">
              <i data-lucide="check-circle-2" aria-hidden="true"></i>
              <span>${this.message}</span>
            </p>
          ` : ''}

          ${this.error ? `
            <p class="memora-notice memora-notice-error" role="alert">
              <i data-lucide="alert-circle" aria-hidden="true"></i>
              <span>${this.error}</span>
            </p>
          ` : ''}

          <div class="memora-stats">
            <div class="memora-stat memora-sheet memora-reveal" style="--memora-reveal-delay: 60ms">
              <span class="memora-stat-value">${stats.albumsCount}</span>
              <span class="memora-stat-label">Memory shelves</span>
            </div>
            <div class="memora-stat memora-sheet memora-reveal" style="--memora-reveal-delay: 130ms">
              <span class="memora-stat-value">${stats.photosCount}</span>
              <span class="memora-stat-label">Photos shared</span>
            </div>
          </div>

          ${
            this.isEditing
              ? `
            <section class="memora-sheet memora-doodle-host memora-reveal">
              ${doodleLayer(
                [
                  [doodle.paperCorner, { className: 'memora-doodle memora-doodle-size-sm memora-float', style: 'top: 1rem; right: 1.5rem;' }],
                ],
                'memora-doodles-honey memora-doodles-faint'
              )}

              <h2 class="memora-sheet-title">
                <i data-lucide="settings-2" aria-hidden="true"></i>
                <span>Account settings</span>
              </h2>

              <!-- Picture first: it saves on pick, so the form below is only
                   ever about the name and the password. -->
              <div class="memora-avatar-picker">
                <img
                  class="memora-avatar-picker-preview"
                  src="${user.avatarUrl || 'https://api.dicebear.com/9.x/avataaars/svg?seed=' + user.username}"
                  alt="Your current profile picture"
                />
                <div class="memora-avatar-picker-body">
                  <span class="memora-label" id="avatar-picker-label">Your picture</span>
                  <p class="memora-sheet-copy">
                    Pick a photo from your device. It is resized and uploaded for you — nothing to paste.
                  </p>

                  <input
                    type="file"
                    id="avatar-file-input"
                    accept="image/png,image/jpeg,image/webp"
                    class="memora-file-input"
                    aria-labelledby="avatar-picker-label"
                  />

                  <div class="memora-avatar-picker-actions">
                    <label for="avatar-file-input" class="memora-button memora-button-inline memora-avatar-choose">
                      <i data-lucide="image-up" aria-hidden="true"></i>
                      <span>${this.avatarUploading ? 'Uploading…' : 'Choose a photo'}</span>
                    </label>
                    ${
                      this.avatarUploading
                        ? `<span class="memora-avatar-spinner" role="status" aria-label="Uploading your picture"></span>`
                        : ''
                    }
                  </div>

                  ${
                    this.avatarError
                      ? `<p class="memora-form-error" role="alert">${this.avatarError}</p>`
                      : ''
                  }
                </div>
              </div>

              <form id="edit-profile-form" class="memora-form" style="margin-top: 1.5rem">
                <div>
                  <label for="edit-name-input" class="memora-label">Display name</label>
                  <input type="text" id="edit-name-input" value="${user.displayName || ''}" placeholder="e.g. Alex Rivera" class="memora-control" />
                </div>

                <div class="memora-divider" role="presentation"></div>

                <h3 class="memora-kicker">Change password</h3>

                <div>
                  <label for="edit-curr-pass-input" class="memora-label">Current password</label>
                  <input type="password" id="edit-curr-pass-input" placeholder="••••••••" class="memora-control" />
                </div>

                <div>
                  <label for="edit-new-pass-input" class="memora-label">New password</label>
                  <input type="password" id="edit-new-pass-input" placeholder="At least 6 characters" class="memora-control" />
                </div>

                <div class="memora-form-actions">
                  <button type="button" class="btn-toggle-edit memora-pill">Cancel</button>
                  <button type="submit" class="memora-button memora-button-inline">
                    <i data-lucide="check" aria-hidden="true"></i>
                    <span>Save changes</span>
                  </button>
                </div>
              </form>
            </section>
          `
              : ''
          }
        </div>
      </div>
    `;
  }
}
