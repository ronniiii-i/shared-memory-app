import { UIComponent } from '../core/UIComponent.js';
import { toast } from './Toast.js';
import { store } from '../core/Store.js';

export class LoggedOutScreen extends UIComponent {
  constructor(props) {
    super(props);
    this.secondsRemaining = 5;
    this.redirectTimer = null;
  }

  onMount() {
    this.delegate('click', 'a[href="#/"]', () => {
      store.authNotice = null;
    });

    this.delegate('click', '.btn-session-sign-in', () => {
      document.dispatchEvent(new CustomEvent('open-custom-auth', { detail: { tab: 'login' } }));
    });

    this.redirectTimer = window.setInterval(() => {
      this.secondsRemaining -= 1;
      if (this.secondsRemaining <= 0) {
        window.clearInterval(this.redirectTimer);
        store.authNotice = null;
        window.location.hash = '#/';
        return;
      }
      const countdown = this.$('.session-countdown');
      if (countdown) countdown.textContent = `${this.secondsRemaining}s`;
    }, 1000);

    toast.info('Your session has ended. Please sign in again.', { duration: 6000 });
  }

  onUnmount() {
    if (this.redirectTimer) window.clearInterval(this.redirectTimer);
  }

  render() {
    return `
      <main class="session-screen">
        <section class="session-panel" aria-labelledby="session-title">
          <div class="session-icon"><i data-lucide="log-in" aria-hidden="true"></i></div>
          <p class="session-eyebrow">Memora</p>
          <h1 id="session-title">Your session has ended</h1>
          <p>For your security, you have been signed out. Sign in again to return to your albums.</p>
          <div class="session-actions">
            <button type="button" class="btn-session-sign-in">Sign in again</button>
            <a href="#/">Go to home</a>
          </div>
          <p class="session-countdown" aria-live="polite">Returning home in ${this.secondsRemaining}s</p>
        </section>
      </main>
    `;
  }
}
