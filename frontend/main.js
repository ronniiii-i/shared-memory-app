import { Router } from './src/core/Router.js';
import { store, loadPersistedState } from './src/core/Store.js';
import { Navbar } from './src/components/Navbar.js';
import { AlbumList } from './src/components/AlbumList.js';
import { ScrapbookView } from './src/components/ScrapbookView.js';
import { JoinAlbum } from './src/components/JoinAlbum.js';
import { ProfileView } from './src/components/ProfileView.js';
import { doodleLayer, doodle } from './src/components/Doodles.js';
import { api } from './src/services/api.js';
import { createIcons, icons } from 'lucide';

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
    modalOverlay.className = 'fixed inset-0 z-[99999] memora-modal-scrim';
    document.body.appendChild(modalOverlay);
  }

  modalOverlay.innerHTML = `
    <div class="relative memora-modal memora-sheet memora-doodle-host">
      ${doodleLayer(
        [
          [doodle.leafSprig, { className: 'memora-doodle memora-doodle-size-sm memora-drift', style: 'top: 4.5rem; left: -1.25rem; --memora-tilt: -7deg;' }],
          [doodle.squiggle, { className: 'memora-doodle memora-doodle-size-sm', style: 'bottom: -0.5rem; right: 2rem; --memora-tilt: 4deg;' }],
        ],
        'memora-doodles-leaf memora-doodles-faint'
      )}

      <button id="close-auth-modal" class="absolute top-4 right-4 memora-pill memora-pill-quiet" style="padding: 0.45rem" aria-label="Close modal">
        <i data-lucide="x" aria-hidden="true"></i>
      </button>

      <div class="w-full text-center">
        <div class="memora-panel-mark mx-auto"><i data-lucide="camera" aria-hidden="true"></i></div>

        <div>
          <p class="memora-kicker">Memora</p>
          <h3 class="memora-modal-title">Welcome back</h3>
          <p class="memora-sheet-copy">A shared place for collecting and reliving moments together.</p>
        </div>

        <!-- Auth Tabs Switcher -->
        <div class="memora-auth-tabs" role="tablist">
          <button id="tab-login-btn" role="tab" aria-selected="${initialTab === 'login'}" class="${initialTab === 'login' ? 'border-[var(--accent-sienna)] text-[var(--accent-sienna)]' : 'border-transparent text-muted hover:text-main'}">
            Sign In
          </button>
          <button id="tab-register-btn" role="tab" aria-selected="${initialTab === 'register'}" class="${initialTab === 'register' ? 'border-[var(--accent-sienna)] text-[var(--accent-sienna)]' : 'border-transparent text-muted hover:text-main'}">
            Create Account
          </button>
        </div>

        <!-- Sign In Form -->
        <form id="auth-login-form" class="memora-form-stack text-left pt-5 ${initialTab === 'login' ? '' : 'hidden'}">
          <div>
            <label for="login-username" class="memora-label">Username</label>
            <input type="text" id="login-username" required placeholder="e.g. alex_vibes" class="memora-control memora-control-mono" />
          </div>

          <div>
            <label for="login-password" class="memora-label">Password</label>
            <input type="password" id="login-password" required placeholder="••••••••" class="memora-control" />
          </div>

          <div id="login-error-msg" class="memora-form-error hidden"></div>

          <button type="submit" class="memora-button memora-button-block memora-button-inline">
            <i data-lucide="log-in" aria-hidden="true"></i>
            <span>Sign In</span>
          </button>
        </form>

        <!-- Register Form -->
        <form id="auth-register-form" class="memora-form-stack text-left pt-5 ${initialTab === 'register' ? '' : 'hidden'}">
          <div>
            <label for="reg-name" class="memora-label">Display Name <span class="memora-label memora-label-quiet">optional</span></label>
            <input type="text" id="reg-name" placeholder="e.g. Alex Rivera" class="memora-control" />
          </div>

          <div>
            <label for="reg-username" class="memora-label">Username</label>
            <input type="text" id="reg-username" required placeholder="e.g. alex_vibes" class="memora-control memora-control-mono" />
          </div>

          <div>
            <label for="reg-password" class="memora-label">Password <span class="memora-label memora-label-quiet">min 6 characters</span></label>
            <input type="password" id="reg-password" required minlength="6" placeholder="••••••••" class="memora-control" />
          </div>

          <div id="reg-error-msg" class="memora-form-error hidden"></div>

          <button type="submit" class="memora-button memora-button-block memora-button-inline">
            <i data-lucide="user-plus" aria-hidden="true"></i>
            <span>Create Account</span>
          </button>
        </form>
      </div>
    </div>
  `;

  modalOverlay.style.display = 'flex';

  // The modal lives outside the Router, so it renders its own Lucide icons.
  try {
    createIcons({ icons, nameAttr: 'data-lucide' });
  } catch {
    // Lucide still initialising — icons fall back to their placeholders.
  }

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
    tabLogin?.setAttribute('aria-selected', String(tab === 'login'));
    tabRegister?.setAttribute('aria-selected', String(tab === 'register'));
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
