import { UIComponent } from '../core/UIComponent.js';
import { toast } from './Toast.js';
import { store } from '../core/Store.js';
import { doodleLayer, doodle } from './Doodles.js';

export class LoggedOutScreen extends UIComponent {
  constructor(props) {
    super(props);
    this.secondsRemaining = 5;
    this.redirectTimer = null;
    this.noticeShown = false;
  }

  onMount() {
    this.delegate('click', 'a[href="#/"]', () => {
      store.authNotice = null;
    });

    this.delegate('click', '.btn-session-sign-in', () => {
      document.dispatchEvent(new CustomEvent('open-custom-auth', { detail: { tab: 'login' } }));
    });

    // onMount() runs again on every update(), so the countdown timer and the
    // notice below are both one-shot effects that have to be guarded. Without
    // this a re-render stacked a second interval (the seconds ticked down
    // several at a time) and re-fired the toast, which is why the very first
    // notification after a page load appeared doubled.
    if (this.redirectTimer) {
      window.clearInterval(this.redirectTimer);
      this.redirectTimer = null;
    }

    this.redirectTimer = window.setInterval(() => {
      this.secondsRemaining -= 1;
      if (this.secondsRemaining <= 0) {
        window.clearInterval(this.redirectTimer);
        this.redirectTimer = null;
        store.authNotice = null;
        window.location.hash = '#/';
        return;
      }
      const countdown = this.$('.session-countdown');
      if (countdown) countdown.textContent = `${this.secondsRemaining}s`;
    }, 1000);

    if (!this.noticeShown) {
      this.noticeShown = true;
      toast.info('Your session has ended. Please sign in again.', { duration: 6000 });
    }
  }

  onUnmount() {
    if (this.redirectTimer) {
      window.clearInterval(this.redirectTimer);
      this.redirectTimer = null;
    }
  }

  render() {
    return `
      <main class="session-screen">
        <section class="session-panel memora-doodle-host" aria-labelledby="session-title">
          ${doodleLayer(
            [
              [doodle.squiggle, { className: 'memora-doodle memora-doodle-size-sm', style: 'top: -0.5rem; left: 50%; margin-left: -2rem; --memora-tilt: -3deg;' }],
              [doodle.leafSprig, { className: 'memora-doodle memora-doodle-size-sm memora-drift', style: 'bottom: -0.75rem; right: 1.5rem; --memora-tilt: -7deg;' }],
            ],
            'memora-doodles-leaf memora-doodles-faint'
          )}

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
