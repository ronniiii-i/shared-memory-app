import { UIComponent } from '../core/UIComponent.js';

export class LandingPage extends UIComponent {
  onMount() {
    this.delegate('click', '.btn-landing-signin', () => {
      document.dispatchEvent(new CustomEvent('open-clerk-auth'));
    });
  }

  render() {
    return `
      <main class="memora-landing">
        <section class="memora-hero" aria-labelledby="memora-hero-title">
          <div class="memora-hero-copy">
            <h1 id="memora-hero-title">Keep the moments that matter.</h1>
            <p class="memora-hero-lede">Memora is a shared place for the photographs, stories, voice notes, and small details you want to remember together.</p>
            <div class="memora-hero-actions">
              <button class="btn-landing-signin memora-primary-action" aria-label="Create your album">
                <i data-lucide="plus"></i>
                <span>Start a shared album</span>
              </button>
              <span class="memora-action-note">For trips, celebrations, and ordinary Tuesdays.</span>
            </div>
          </div>

          <div class="memora-hero-art" aria-label="A collection of shared memories">
            <div class="memora-photo-stack">
              <img class="memora-photo memora-photo-back" src="https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=900&q=85&auto=format&fit=crop" alt="Friends laughing together" />
              <img class="memora-photo memora-photo-front" src="https://images.unsplash.com/photo-1504150558240-0b4fd8946624?w=900&q=85&auto=format&fit=crop" alt="Friends gathered around a table" />
              <span class="memora-photo-caption">The good stuff, together.</span>
            </div>
            <div class="memora-note memora-note-one"><i data-lucide="heart"></i><span>so glad we were all there</span></div>
            <div class="memora-note memora-note-two"><i data-lucide="map-pin"></i><span>Lisbon, late summer</span></div>
          </div>
        </section>

        <section class="memora-belief-band" aria-label="Why Memora">
          <p class="memora-eyebrow">A little less scrolling. A lot more remembering.</p>
          <h2>The stories are better when everyone gets to add a piece.</h2>
          <p>Bring the whole group into one album, then let the memories grow naturally. No perfect captions required.</p>
        </section>

        <section class="memora-flow" aria-labelledby="memora-flow-title">
          <div class="memora-section-heading">
            <p class="memora-eyebrow">Made for real life</p>
            <h2 id="memora-flow-title">Start with a moment. End with a keepsake.</h2>
          </div>
          <div class="memora-flow-grid">
            <article class="memora-flow-item">
              <span class="memora-step-number">01</span>
              <i data-lucide="users"></i>
              <h3>Gather your people</h3>
              <p>Make an album and invite friends or family with one simple link.</p>
            </article>
            <article class="memora-flow-item">
              <span class="memora-step-number">02</span>
              <i data-lucide="camera"></i>
              <h3>Let the memories in</h3>
              <p>Everyone can add photos, reactions, captions, and voice notes as the day unfolds.</p>
            </article>
            <article class="memora-flow-item">
              <span class="memora-step-number">03</span>
              <i data-lucide="book-heart"></i>
              <h3>Come back to it</h3>
              <p>Browse the gallery or make a scrapbook page when you are ready to relive it.</p>
            </article>
          </div>
        </section>

        <section class="memora-quote-section">
          <blockquote>“The best part was seeing everyone’s version of the same day.”</blockquote>
          <p>That is what Memora is for.</p>
        </section>

        <section class="memora-final-cta" aria-labelledby="memora-final-title">
          <p class="memora-eyebrow">Your next favorite memory is probably already happening.</p>
          <h2 id="memora-final-title">Make a place for it.</h2>
          <button class="btn-landing-signin memora-primary-action" aria-label="Create your album">
            <i data-lucide="arrow-right"></i>
            <span>Create your first album</span>
          </button>
        </section>

        <footer class="memora-landing-footer">
          <strong>Memora</strong>
          <span>Shared moments, kept close.</span>
        </footer>
      </main>
    `;
  }
}
