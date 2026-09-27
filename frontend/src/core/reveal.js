/**
 * Memora — reveal-on-scroll helper
 *
 * Deliberately tiny and dependency-free. All easing, transforms and
 * timing live in CSS (`.memora-reveal` in src/styles/main.css); this module
 * only flips an `is-revealed` class when an element first enters the
 * viewport.
 *
 * Two safety rails:
 *  - `.memora-reveal` only hides while `html` carries `.memora-reveal-ready`,
 *    so content is never stranded at opacity 0 if this module fails to run.
 *  - When the user prefers reduced motion, every element is revealed at once
 *    and the observer is never created.
 */

const READY_CLASS = 'memora-reveal-ready';
const REVEAL_SELECTOR = '.memora-reveal, .memora-reveal-drift';
const REVEALED_CLASS = 'is-revealed';

const reduceMotionQuery =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

let observer = null;

function getObserver() {
  if (observer) return observer;

  // No IntersectionObserver, or the user asked for stillness: reveal
  // everything immediately rather than leaving content invisible.
  if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
    return null;
  }

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add(REVEALED_CLASS);
        observer.unobserve(entry.target);
      }
    },
    {
      // Fire a little after the element edges appear so the reveal reads as
      // a considered pause rather than a pop.
      rootMargin: '0px 0px -12% 0px',
      threshold: 0.08,
    }
  );

  return observer;
}

function prefersReducedMotion() {
  return Boolean(reduceMotionQuery?.matches);
}

/**
 * Is the element already inside the viewport (or close enough that scrolling
 * would not be expected first)?
 */
function isOnScreen(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return rect.top < window.innerHeight * 0.92 && rect.bottom > 0;
}

/**
 * Flip a target to its visible state once the browser has had a chance to
 * paint the hidden start state.
 *
 * An IntersectionObserver only delivers its first notification on the next
 * frame, so anything already on screen has to be revealed by hand — and even
 * then, a timer races the frames so content can never be stranded at
 * opacity 0 in an environment where frames are throttled or paused.
 */
function scheduleReveal(el) {
  const reveal = () => el.classList.add(REVEALED_CLASS);

  if (typeof requestAnimationFrame !== 'function') {
    setTimeout(reveal, 16);
    return;
  }

  // Two frames, so the hidden start state is committed before we transition
  // away from it and the entrance actually reads as motion.
  requestAnimationFrame(() => requestAnimationFrame(reveal));
  setTimeout(reveal, 400);
}

/**
 * Register every reveal target inside `root` with the shared observer.
 * Safe to call repeatedly — already-revealed and unobserved nodes are skipped.
 *
 * @param {HTMLElement} root - Subtree to scan (usually a component root)
 */
export function observeReveals(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;

  const targets = root.matches?.(REVEAL_SELECTOR)
    ? [root, ...root.querySelectorAll(REVEAL_SELECTOR)]
    : [...root.querySelectorAll(REVEAL_SELECTOR)];

  if (targets.length === 0) return;

  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    for (const target of targets) target.classList.add(REVEALED_CLASS);
    return;
  }

  const pending = targets.filter((target) => !target.classList.contains(REVEALED_CLASS));
  if (pending.length === 0) return;

  // Enable the hiding rule only now that we know every target will be
  // un-hidden by the end of this call.
  document.documentElement.classList.add(READY_CLASS);

  // Already on screen: reveal on the next frame rather than waiting for the
  // observer. Below the fold: let the observer decide when it arrives.
  const deferred = [];
  for (const target of pending) {
    if (isOnScreen(target)) {
      scheduleReveal(target);
    } else {
      deferred.push(target);
    }
  }

  if (deferred.length === 0) return;

  const io = getObserver();
  if (!io) {
    for (const target of deferred) target.classList.add(REVEALED_CLASS);
    return;
  }

  for (const target of deferred) io.observe(target);
}

// If the user flips the OS motion preference mid-session, stop waiting.
reduceMotionQuery?.addEventListener?.('change', (event) => {
  if (!event.matches) return;
  observer?.disconnect();
  observer = null;
  for (const target of document.querySelectorAll(REVEAL_SELECTOR)) {
    target.classList.add(REVEALED_CLASS);
  }
});
