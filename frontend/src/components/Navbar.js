import { UIComponent } from '../core/UIComponent.js';
import { store } from '../core/Store.js';

export class Navbar extends UIComponent {
  constructor(props) {
    super(props);
    this.reactTo(['currentUser', 'theme', 'activeAlbumId', 'currentRoute']);
  }

  onMount() {
    this.delegate('click', '.btn-theme-toggle', () => {
      store.theme = store.theme === 'dark' ? 'light' : 'dark';
    });

    this.delegate('click', '.btn-sign-out', () => {
      localStorage.removeItem('vibevault-token');
      store.currentUser = null;
      store.isAuthenticated = false;
      window.location.hash = '#/';
    });

    this.delegate('click', '.btn-sign-in', () => {
      document.dispatchEvent(new CustomEvent('open-custom-auth', { detail: { tab: 'login' } }));
    });

    this.delegate('click', '.btn-register', () => {
      document.dispatchEvent(new CustomEvent('open-custom-auth', { detail: { tab: 'register' } }));
    });
  }

  render() {
    const { currentUser, theme, currentRoute } = store;
    const isDark = theme === 'dark';
    const onShelf = currentRoute === '/' || currentRoute === '';

    return `
      <header class="memora-nav">
        <a href="#/" class="memora-nav-brand" aria-label="Memora Home">
          <span class="memora-wordmark-mark" aria-hidden="true">
            <i data-lucide="camera"></i>
          </span>
          <span class="memora-wordmark">Memora</span>
        </a>

        ${
          currentUser
            ? `
          <nav class="memora-nav-links" aria-label="Primary">
            <a href="#/" class="memora-nav-link ${onShelf ? 'is-active' : ''}" ${onShelf ? 'aria-current="page"' : ''}>
              <i data-lucide="layout-grid" aria-hidden="true"></i>
              <span>Memory shelf</span>
            </a>
            <a href="#/profile" class="memora-nav-link ${currentRoute === '/profile' ? 'is-active' : ''}" ${currentRoute === '/profile' ? 'aria-current="page"' : ''}>
              <i data-lucide="user" aria-hidden="true"></i>
              <span>My profile</span>
            </a>
          </nav>
        `
            : ''
        }

        <div class="memora-nav-actions">
          <button class="btn-theme-toggle memora-pill memora-pill-quiet" aria-label="Switch to ${isDark ? 'light' : 'dark'} theme" title="Switch to ${isDark ? 'light' : 'dark'} theme">
            <i data-lucide="${isDark ? 'sun' : 'moon'}" aria-hidden="true"></i>
            <span class="hidden sm:inline">${isDark ? 'Light' : 'Dark'}</span>
          </button>

          ${
            currentUser
              ? `
            <a href="#/profile" class="memora-identity-link" title="View profile">
              <img class="memora-avatar" src="${currentUser.avatarUrl || 'https://api.dicebear.com/9.x/avataaars/svg?seed=' + currentUser.username}" alt="" />
              <span>${currentUser.displayName || currentUser.username}</span>
            </a>
            <button class="btn-sign-out memora-pill memora-pill-quiet" title="Sign out" aria-label="Sign out">
              <i data-lucide="log-out" aria-hidden="true"></i>
            </button>
          `
              : `
            <button class="btn-sign-in memora-pill">Sign in</button>
            <button class="btn-register memora-pill memora-pill-primary">
              <i data-lucide="plus" aria-hidden="true"></i>
              <span>Start an album</span>
            </button>
          `
        }
        </div>
      </header>
    `;
  }
}
