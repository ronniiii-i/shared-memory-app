import { UIComponent } from '../core/UIComponent.js';
import { doodle, doodleLayer } from './Doodles.js';

const FLOW_DOODLES = [
  {
    mark: doodle.starBurst,
    className: 'memora-doodle memora-doodle-size-sm',
    style: 'top: 1.1rem; right: 1.1rem; --memora-tilt: 8deg;',
    layer: 'memora-doodles-honey memora-doodles-faint',
  },
  {
    mark: doodle.squiggle,
    className: 'memora-doodle memora-doodle-size-sm',
    style: 'bottom: 1rem; right: 1.25rem; --memora-tilt: -4deg;',
    layer: 'memora-doodles-honey memora-doodles-faint',
  },
  {
    mark: doodle.leafSprig,
    className: 'memora-doodle memora-doodle-size-sm',
    style: 'bottom: 0.75rem; right: 1.1rem; --memora-tilt: -6deg;',
    layer: 'memora-doodles-leaf memora-doodles-faint',
  },
];

export class LandingPage extends UIComponent {
  onMount() {
    this.delegate('click', '.btn-landing-signin', () => {
      document.dispatchEvent(new CustomEvent('open-custom-auth'));
    });
  }

  renderFlowItem({ step, icon, title, copy, delay }, accent) {
    return `
      <article class="memora-flow-item memora-reveal" style="--memora-reveal-delay: ${delay}ms">
        ${doodleLayer(
          [[accent.mark, { className: accent.className, style: accent.style }]],
          accent.layer
        )}
        <span class="memora-step-number">${step}</span>
        <i data-lucide="${icon}"></i>
        <h3>${title}</h3>
        <p>${copy}</p>
      </article>
    `;
  }

  render() {
    return `
      <main class="memora-landing">
        <section class="memora-hero" aria-labelledby="memora-hero-title">
          ${doodleLayer(
            [
              [doodle.scribbleUnderline, { className: 'memora-doodle memora-doodle-size-md memora-draw-rule', style: 'top: 22%; right: -1.5rem; --memora-tilt: -3deg;' }],
              [doodle.starBurst, { className: 'memora-doodle memora-doodle-size-sm memora-float', style: 'bottom: 6%; left: -1.25rem; --memora-tilt: -10deg;' }],
              [doodle.mountain, { className: 'memora-doodle memora-doodle-size-md', style: 'bottom: -0.5rem; left: 44%;' }],
            ],
            'memora-doodles-faint'
          )}

          <div class="memora-hero-copy">
            <h1 id="memora-hero-title" class="memora-enter" style="--memora-reveal-delay: 40ms">Keep the moments that matter.</h1>
            <p class="memora-hero-lede memora-enter" style="--memora-reveal-delay: 170ms">Memora is a shared place for the photographs, stories, voice notes, and small details you want to remember together.</p>
            <div class="memora-hero-actions memora-enter" style="--memora-reveal-delay: 300ms">
              <button class="btn-landing-signin memora-primary-action" aria-label="Create your album">
                <i data-lucide="plus"></i>
                <span>Start a shared album</span>
              </button>
              <span class="memora-action-note">For trips, celebrations, and ordinary Tuesdays.</span>
            </div>
          </div>

          <div class="memora-hero-art memora-enter" style="--memora-reveal-delay: 220ms" aria-label="A collection of shared memories">
            ${doodleLayer(
              [
                [doodle.arrowCurl, { className: 'memora-doodle memora-doodle-size-md', style: 'top: 2%; left: -2rem; --memora-tilt: 4deg;' }],
                [doodle.heartScribble, { className: 'memora-doodle memora-doodle-size-sm memora-nudge', style: 'bottom: 8%; right: -1rem; --memora-tilt: 6deg;' }],
              ],
              'memora-doodles-faint'
            )}

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
          ${doodleLayer(
            [
              [doodle.sunRays, { className: 'memora-doodle memora-doodle-size-md memora-float', style: 'top: 2rem; left: 6%; --memora-tilt: 12deg;' }],
              [doodle.leafSprig, { className: 'memora-doodle memora-doodle-size-md', style: 'bottom: 1.5rem; right: 5%; --memora-tilt: -8deg;' }],
            ],
            'memora-doodles-honey memora-doodles-faint'
          )}

          <p class="memora-eyebrow memora-reveal">A little less scrolling. A lot more remembering.</p>
          <h2 class="memora-reveal" style="--memora-reveal-delay: 70ms">The stories are better when everyone gets to add a piece.</h2>
          <p class="memora-reveal" style="--memora-reveal-delay: 140ms">Bring the whole group into one album, then let the memories grow naturally. No perfect captions required.</p>
        </section>

        <section class="memora-flow" aria-labelledby="memora-flow-title">
          <div class="memora-section-heading">
            <p class="memora-eyebrow memora-reveal">Made for real life</p>
            <h2 id="memora-flow-title" class="memora-reveal" style="--memora-reveal-delay: 70ms">Start with a moment. End with a keepsake.</h2>
          </div>
          <div class="memora-flow-grid">
            ${[
              { step: '01', icon: 'users', title: 'Gather your people', copy: 'Make an album and invite friends or family with one simple link.', delay: 60 },
              { step: '02', icon: 'camera', title: 'Let the memories in', copy: 'Everyone can add photos, reactions, captions, and voice notes as the day unfolds.', delay: 130 },
              { step: '03', icon: 'book-heart', title: 'Come back to it', copy: 'Browse the gallery or make a scrapbook page when you are ready to relive it.', delay: 200 },
            ]
              .map((step, i) => this.renderFlowItem(step, FLOW_DOODLES[i]))
              .join('')}
          </div>
        </section>

        <section class="memora-quote-section">
          ${doodleLayer(
            [
              [doodle.wave, { className: 'memora-doodle memora-doodle-size-md', style: 'top: 2.5rem; left: 4%;' }],
              [doodle.wave, { className: 'memora-doodle memora-doodle-size-md', style: 'bottom: 2.5rem; right: 4%; --memora-tilt: 180deg;' }],
            ],
            'memora-doodles-sky memora-doodles-faint'
          )}

          <div class="memora-reveal">
            <blockquote>
              ${doodle.quoteMark({ className: 'memora-quote-mark' })}
              “The best part was seeing everyone’s version of the same day.”
            </blockquote>
            <p>That is what Memora is for.</p>
          </div>
        </section>

        <section class="memora-final-cta" aria-labelledby="memora-final-title">
          ${doodleLayer(
            [
              [doodle.starBurst, { className: 'memora-doodle memora-doodle-size-sm memora-float', style: 'top: 3.5rem; left: 12%; --memora-tilt: -8deg;' }],
              [doodle.flowerDoodle, { className: 'memora-doodle memora-doodle-size-md memora-drift', style: 'bottom: 4rem; right: 10%; --memora-tilt: 7deg;' }],
            ],
            'memora-doodles-leaf memora-doodles-faint'
          )}

          <p class="memora-eyebrow memora-reveal">Your next favorite memory is probably already happening.</p>
          <h2 id="memora-final-title" class="memora-reveal" style="--memora-reveal-delay: 80ms">Make a place for it.</h2>
          <div class="memora-reveal" style="--memora-reveal-delay: 170ms">
            <button class="btn-landing-signin memora-primary-action" aria-label="Create your album">
              <i data-lucide="arrow-right"></i>
              <span>Create your first album</span>
            </button>
          </div>
        </section>

        <footer class="memora-landing-footer">
          <strong>Memora</strong>
          <span>Shared moments, kept close.</span>
        </footer>
      </main>
    `;
  }
}
