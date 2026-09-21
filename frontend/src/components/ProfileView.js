import { UIComponent } from '../core/UIComponent.js';
import { store } from '../core/Store.js';
import { api } from '../services/api.js';

export class ProfileView extends UIComponent {
  constructor(props) {
    super(props);
    this.user = store.currentUser;
    this.stats = { albumsCount: 0, photosCount: 0 };
    this.isEditing = false;
    this.message = '';
    this.error = '';
    this._fetched = false;
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
      this.update();
    });

    this.delegate('submit', '#edit-profile-form', (e) => this.handleSaveProfile(e));
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
    const avatarInput = this.$('#edit-avatar-input');
    const currPassInput = this.$('#edit-curr-pass-input');
    const newPassInput = this.$('#edit-new-pass-input');

    const displayName = nameInput ? nameInput.value.trim() : undefined;
    const avatarUrl = avatarInput ? avatarInput.value.trim() : undefined;
    const currentPassword = currPassInput ? currPassInput.value : undefined;
    const newPassword = newPassInput ? newPassInput.value : undefined;

    try {
      const updated = await api.patch('/users/profile', {
        displayName,
        avatarUrl,
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
        <div class="max-w-md mx-auto my-20 editorial-card p-8 rounded-2xl text-center">
          <h2 class="font-serif-heading text-2xl font-bold text-heading mb-2">Sign In Required</h2>
          <p class="text-xs text-muted mb-6">Please sign in to access your profile and album settings.</p>
          <button onclick="document.dispatchEvent(new CustomEvent('open-custom-auth'))" class="px-6 py-3 bg-[var(--accent-sienna)] text-white font-semibold text-xs rounded-xl shadow cursor-pointer">
            Sign In Now
          </button>
        </div>
      `;
    }

    const { user, stats } = this;

    return `
      <div class="max-w-4xl mx-auto px-6 py-12">
        <!-- Header Profile Card -->
        <div class="editorial-card p-8 rounded-3xl mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div class="flex items-center gap-5">
            <img src="${user.avatarUrl || 'https://api.dicebear.com/9.x/avataaars/svg?seed=' + user.username}" alt="${user.username}" class="w-20 h-20 rounded-full border-2 border-[var(--border-strong)] bg-stone-100 object-cover" />
            <div>
              <h1 class="font-serif-heading text-3xl font-bold text-heading">${user.displayName || user.username}</h1>
              <p class="text-xs text-muted font-mono mt-1">@${user.username}</p>
              <p class="text-xs text-muted mt-1">Member since ${new Date(user.createdAt || Date.now()).toLocaleDateString()}</p>
            </div>
          </div>

          <button class="btn-toggle-edit px-5 py-2.5 bg-stone-800 dark:bg-stone-700 hover:bg-stone-700 text-white font-semibold text-xs rounded-xl cursor-pointer transition-all flex items-center gap-2">
            <i data-lucide="${this.isEditing ? 'x' : 'edit-3'}" class="w-4 h-4"></i>
            <span>${this.isEditing ? 'Cancel Editing' : 'Edit Profile'}</span>
          </button>
        </div>

        ${this.message ? `
          <div class="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
            ${this.message}
          </div>
        ` : ''}

        ${this.error ? `
          <div class="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold">
            ${this.error}
          </div>
        ` : ''}

        <!-- Stats Overview -->
        <div class="grid grid-cols-2 gap-4 mb-8">
          <div class="editorial-card p-6 rounded-2xl">
            <div class="text-xs font-semibold text-muted uppercase tracking-wider">Albums Joined</div>
            <div class="font-serif-heading text-4xl font-bold text-heading mt-2">${stats.albumsCount}</div>
          </div>
          <div class="editorial-card p-6 rounded-2xl">
            <div class="text-xs font-semibold text-muted uppercase tracking-wider">Photos Contributed</div>
            <div class="font-serif-heading text-4xl font-bold text-heading mt-2">${stats.photosCount}</div>
          </div>
        </div>

        <!-- Edit Profile Form -->
        ${this.isEditing ? `
          <div class="editorial-card p-8 rounded-3xl mb-8">
            <h2 class="font-serif-heading text-xl font-bold text-heading mb-6">Account Settings</h2>
            
            <form id="edit-profile-form" class="space-y-5">
              <div>
                <label for="edit-name-input" class="block text-xs font-semibold text-main mb-1.5">Display Name</label>
                <input type="text" id="edit-name-input" value="${user.displayName || ''}" placeholder="e.g. Alex Rivera" class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-xs text-main focus:outline-none focus:border-[var(--accent-sienna)]" />
              </div>

              <div>
                <label for="edit-avatar-input" class="block text-xs font-semibold text-main mb-1.5">Avatar Image URL (Optional)</label>
                <input type="url" id="edit-avatar-input" value="${user.avatarUrl || ''}" placeholder="https://..." class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-xs text-main focus:outline-none focus:border-[var(--accent-sienna)]" />
              </div>

              <div class="pt-4 border-t border-[var(--border-color)] space-y-4">
                <h3 class="font-semibold text-xs text-heading uppercase tracking-wider">Change Password</h3>
                <div>
                  <label for="edit-curr-pass-input" class="block text-xs font-semibold text-main mb-1.5">Current Password</label>
                  <input type="password" id="edit-curr-pass-input" placeholder="••••••••" class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-xs text-main focus:outline-none focus:border-[var(--accent-sienna)]" />
                </div>
                <div>
                  <label for="edit-new-pass-input" class="block text-xs font-semibold text-main mb-1.5">New Password</label>
                  <input type="password" id="edit-new-pass-input" placeholder="At least 6 characters" class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-xs text-main focus:outline-none focus:border-[var(--accent-sienna)]" />
                </div>
              </div>

              <div class="flex justify-end gap-3 pt-4">
                <button type="button" class="btn-toggle-edit px-5 py-2.5 bg-stone-200 dark:bg-stone-800 text-main font-semibold text-xs rounded-xl cursor-pointer">
                  Cancel
                </button>
                <button type="submit" class="px-6 py-2.5 bg-[var(--accent-sienna)] text-white font-semibold text-xs rounded-xl shadow cursor-pointer">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        ` : ''}
      </div>
    `;
  }
}
