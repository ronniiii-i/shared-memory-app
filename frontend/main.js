import { Router } from './src/core/Router.js';
import { store, loadPersistedState } from './src/core/Store.js';
import { Navbar } from './src/components/Navbar.js';
import { AlbumList } from './src/components/AlbumList.js';
import { ScrapbookView } from './src/components/ScrapbookView.js';
import { JoinAlbum } from './src/components/JoinAlbum.js';
import { ProfileView } from './src/components/ProfileView.js';
import { api } from './src/services/api.js';

// Load stored theme preference
loadPersistedState();

// Initialize SPA Router
const router = new Router({
  '/': AlbumList,
  '/album/:id': ScrapbookView,
  '/join/:code': JoinAlbum,
  '/profile': ProfileView,
  '/admin': ProfileView,
});

/**
 * Open Editorial Custom Auth Modal (Sign In / Register)
 */
export function openAuthModal(initialTab = 'login') {
  let modalOverlay = document.getElementById('vibevault-auth-modal');

  if (!modalOverlay) {
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'vibevault-auth-modal';
    modalOverlay.className = 'fixed inset-0 z-[99999] bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto';
    document.body.appendChild(modalOverlay);
  }

  modalOverlay.innerHTML = `
    <div class="relative editorial-card border border-[var(--border-color)] rounded-3xl p-8 shadow-2xl max-w-md w-full my-8 text-main animate-in fade-in zoom-in duration-150">
      <button id="close-auth-modal" class="absolute top-4 right-4 p-2 text-muted hover:text-heading rounded-full bg-stone-200/50 dark:bg-stone-800/50 transition-colors cursor-pointer z-10" aria-label="Close modal">
        ✕
      </button>

      <div class="w-full text-center space-y-4">
        <div class="w-12 h-12 rounded-2xl bg-[var(--accent-sienna)] text-white flex items-center justify-center mx-auto shadow-md">
          <i data-lucide="camera" class="w-6 h-6"></i>
        </div>

        <div>
          <h3 class="font-serif-heading font-bold text-2xl text-heading">Welcome to VibeVault</h3>
          <p class="text-xs text-muted mt-1">Shared photo scrapbooks for you & your crew</p>
        </div>

        <!-- Auth Tabs Switcher -->
        <div class="flex border-b border-[var(--border-color)] mt-4">
          <button id="tab-login-btn" class="flex-1 py-2.5 text-xs font-semibold border-b-2 cursor-pointer transition-colors ${initialTab === 'login' ? 'border-[var(--accent-sienna)] text-[var(--accent-sienna)]' : 'border-transparent text-muted hover:text-main'}">
            Sign In
          </button>
          <button id="tab-register-btn" class="flex-1 py-2.5 text-xs font-semibold border-b-2 cursor-pointer transition-colors ${initialTab === 'register' ? 'border-[var(--accent-sienna)] text-[var(--accent-sienna)]' : 'border-transparent text-muted hover:text-main'}">
            Create Account
          </button>
        </div>

        <!-- Sign In Form -->
        <form id="auth-login-form" class="space-y-4 text-left pt-3 ${initialTab === 'login' ? '' : 'hidden'}">
          <div>
            <label for="login-username" class="block text-xs font-semibold text-main mb-1">Username</label>
            <input type="text" id="login-username" required placeholder="e.g. alex_vibes" class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-xs text-main focus:outline-none focus:border-[var(--accent-sienna)]" />
          </div>

          <div>
            <label for="login-password" class="block text-xs font-semibold text-main mb-1">Password</label>
            <input type="password" id="login-password" required placeholder="••••••••" class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-xs text-main focus:outline-none focus:border-[var(--accent-sienna)]" />
          </div>

          <div id="login-error-msg" class="hidden text-xs text-red-500 font-semibold p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-center"></div>

          <button type="submit" class="w-full py-3.5 bg-[var(--accent-sienna)] hover:bg-[var(--accent-terracotta)] text-white font-semibold text-xs rounded-xl shadow cursor-pointer transition-all hover:scale-[1.01]">
            Sign In
          </button>
        </form>

        <!-- Register Form -->
        <form id="auth-register-form" class="space-y-4 text-left pt-3 ${initialTab === 'register' ? '' : 'hidden'}">
          <div>
            <label for="reg-name" class="block text-xs font-semibold text-main mb-1">Display Name</label>
            <input type="text" id="reg-name" placeholder="e.g. Alex Rivera" class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-xs text-main focus:outline-none focus:border-[var(--accent-sienna)]" />
          </div>

          <div>
            <label for="reg-username" class="block text-xs font-semibold text-main mb-1">Username *</label>
            <input type="text" id="reg-username" required placeholder="e.g. alex_vibes" class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-xs text-main focus:outline-none focus:border-[var(--accent-sienna)]" />
          </div>

          <div>
            <label for="reg-password" class="block text-xs font-semibold text-main mb-1">Password (min 6 characters) *</label>
            <input type="password" id="reg-password" required minlength="6" placeholder="••••••••" class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-xs text-main focus:outline-none focus:border-[var(--accent-sienna)]" />
          </div>

          <div id="reg-error-msg" class="hidden text-xs text-red-500 font-semibold p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-center"></div>

          <button type="submit" class="w-full py-3.5 bg-[var(--accent-sienna)] hover:bg-[var(--accent-terracotta)] text-white font-semibold text-xs rounded-xl shadow cursor-pointer transition-all hover:scale-[1.01]">
            Create Account
          </button>
        </form>
      </div>
    </div>
  `;

  modalOverlay.style.display = 'flex';

  const closeBtn = document.getElementById('close-auth-modal');
  const tabLogin = document.getElementById('tab-login-btn');
  const tabRegister = document.getElementById('tab-register-btn');
  const formLogin = document.getElementById('auth-login-form');
  const formRegister = document.getElementById('auth-register-form');
  const loginErr = document.getElementById('login-error-msg');
  const regErr = document.getElementById('reg-error-msg');

  if (closeBtn) {
    closeBtn.onclick = () => { modalOverlay.style.display = 'none'; };
  }

  modalOverlay.onclick = (e) => {
    if (e.target === modalOverlay) modalOverlay.style.display = 'none';
  };

  const switchTab = (tab) => {
    if (tab === 'login') {
      formLogin?.classList.remove('hidden');
      formRegister?.classList.add('hidden');
      tabLogin?.classList.add('border-[var(--accent-sienna)]', 'text-[var(--accent-sienna)]');
      tabLogin?.classList.remove('border-transparent', 'text-muted');
      tabRegister?.classList.remove('border-[var(--accent-sienna)]', 'text-[var(--accent-sienna)]');
      tabRegister?.classList.add('border-transparent', 'text-muted');
    } else {
      formRegister?.classList.remove('hidden');
      formLogin?.classList.add('hidden');
      tabRegister?.classList.add('border-[var(--accent-sienna)]', 'text-[var(--accent-sienna)]');
      tabRegister?.classList.remove('border-transparent', 'text-muted');
      tabLogin?.classList.remove('border-[var(--accent-sienna)]', 'text-[var(--accent-sienna)]');
      tabLogin?.classList.add('border-transparent', 'text-muted');
    }
  };

  if (tabLogin) tabLogin.onclick = () => switchTab('login');
  if (tabRegister) tabRegister.onclick = () => switchTab('register');

  if (formLogin) {
    formLogin.onsubmit = async (e) => {
      e.preventDefault();
      if (loginErr) loginErr.classList.add('hidden');

      const username = document.getElementById('login-username')?.value.trim();
      const password = document.getElementById('login-password')?.value;

      try {
        const { user, token } = await api.post('/users/login', { username, password });
        localStorage.setItem('vibevault-token', token);
        store.authNotice = null;
        store.currentUser = user;
        store.isAuthenticated = true;
        modalOverlay.style.display = 'none';
        router.handleRoute();
      } catch (err) {
        if (loginErr) {
          loginErr.textContent = err.message || 'Invalid username or password';
          loginErr.classList.remove('hidden');
        }
      }
    };
  }

  if (formRegister) {
    formRegister.onsubmit = async (e) => {
      e.preventDefault();
      if (regErr) regErr.classList.add('hidden');

      const displayName = document.getElementById('reg-name')?.value.trim();
      const username = document.getElementById('reg-username')?.value.trim();
      const password = document.getElementById('reg-password')?.value;

      try {
        const { user, token } = await api.post('/users/register', { username, password, displayName });
        localStorage.setItem('vibevault-token', token);
        store.authNotice = null;
        store.currentUser = user;
        store.isAuthenticated = true;
        modalOverlay.style.display = 'none';
        router.handleRoute();
      } catch (err) {
        if (regErr) {
          regErr.textContent = err.message || 'Registration failed';
          regErr.classList.remove('hidden');
        }
      }
    };
  }
}

// Global listener for auth modal requests
document.addEventListener('open-clerk-auth', (e) => {
  openAuthModal(e.detail?.tab || 'login');
});
document.addEventListener('open-custom-auth', (e) => {
  openAuthModal(e.detail?.tab || 'login');
});

/**
 * Initialize Application
 */
async function initApp() {
  const existingToken = localStorage.getItem('vibevault-token');
  if (existingToken) {
    try {
      const user = await api.get('/users/me');
      store.currentUser = user;
      store.isAuthenticated = true;
    } catch (err) {
      console.warn('Session expired or invalid:', err.message);
      localStorage.removeItem('vibevault-token');
      store.authNotice = { reason: 'expired' };
      store.currentUser = null;
      store.isAuthenticated = false;
    }
  }

  const loader = document.getElementById('app-loader');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 300);
  }

  const appContainer = document.getElementById('app');
  appContainer.innerHTML = '';

  const navbarContainer = document.createElement('div');
  const viewContainer = document.createElement('main');
  viewContainer.id = 'router-view';
  viewContainer.setAttribute('role', 'main');

  appContainer.appendChild(navbarContainer);
  appContainer.appendChild(viewContainer);

  const navbar = new Navbar();
  navbar.mount(navbarContainer);

  router.init(viewContainer);
}

initApp().catch(console.error);
