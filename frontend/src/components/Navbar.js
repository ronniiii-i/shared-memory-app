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

    return `
      <header class="sticky top-0 z-50 editorial-card border-b border-[var(--border-color)] px-6 py-4 flex items-center justify-between backdrop-blur-xl">
        <a href="#/" class="flex items-center gap-3 group focus:outline-none rounded-xl p-1 z-10" aria-label="VibeVault Home">
          <div class="w-8 h-8 rounded-lg bg-[var(--accent-sienna)] flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
            <i data-lucide="camera" class="w-4 h-4"></i>
          </div>
          <span class="font-serif-heading font-bold text-xl tracking-tight text-heading">
            VibeVault
          </span>
        </a>

        ${currentUser ? `
          <nav class="hidden md:flex items-center gap-6 absolute left-1/2 -translate-x-1/2">
            <a href="#/" class="text-xs font-semibold transition-colors flex items-center gap-1.5 ${currentRoute === '/' || currentRoute === '' ? 'text-[var(--accent-sienna)]' : 'text-main hover:text-[var(--accent-sienna)]'}">
              <i data-lucide="layout-grid" class="w-4 h-4"></i>
              <span>Dashboard</span>
            </a>
            <a href="#/profile" class="text-xs font-semibold transition-colors flex items-center gap-1.5 ${currentRoute === '/profile' ? 'text-[var(--accent-sienna)]' : 'text-main hover:text-[var(--accent-sienna)]'}">
              <i data-lucide="user" class="w-4 h-4"></i>
              <span>Profile Settings</span>
            </a>
          </nav>
        ` : ''}

        <div class="flex items-center gap-4 z-10">
          <!-- Theme Toggle -->
          <button class="btn-theme-toggle p-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800/80 dark:hover:bg-stone-700/80 text-main transition-all cursor-pointer flex items-center gap-2 border border-[var(--border-color)] text-xs font-medium" aria-label="Toggle dark or light theme">
            ${isDark ? `
              <i data-lucide="sun" class="w-4 h-4 text-amber-400"></i>
              <span class="hidden sm:inline">Light</span>
            ` : `
              <i data-lucide="moon" class="w-4 h-4 text-stone-700"></i>
              <span class="hidden sm:inline">Dark</span>
            `}
          </button>

          <!-- Profile or Sign In -->
          ${currentUser ? `
            <div class="flex items-center gap-3">
              <a href="#/profile" class="flex items-center gap-2 group p-1 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors" title="View Profile">
                <img src="${currentUser.avatarUrl || 'https://api.dicebear.com/9.x/avataaars/svg?seed=' + currentUser.username}" alt="${currentUser.username}" class="w-8 h-8 rounded-full border border-[var(--border-strong)] bg-stone-100" />
                <span class="text-xs font-semibold text-main hidden md:inline group-hover:text-[var(--accent-sienna)] transition-colors">
                  ${currentUser.displayName || currentUser.username}
                </span>
              </a>

              <button class="btn-sign-out p-2 text-muted hover:text-red-600 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer" title="Sign Out" aria-label="Sign Out">
                <i data-lucide="log-out" class="w-4 h-4"></i>
              </button>
            </div>
          ` : `
            <div class="flex items-center gap-2">
              <button class="btn-sign-in px-4 py-2 text-xs font-semibold text-main hover:text-heading cursor-pointer transition-colors">
                Sign In
              </button>
              <button class="btn-register px-4 py-2 bg-[var(--accent-sienna)] hover:bg-[var(--accent-terracotta)] text-white font-semibold text-xs rounded-xl shadow cursor-pointer transition-all hover:scale-[1.02]">
                Get Started
              </button>
            </div>
          `}
        </div>
      </header>
    `;
  }
}
