import { UIComponent } from '../core/UIComponent.js';
import { AudioRecorder } from './AudioRecorder.js';
import { api } from '../services/api.js';
import { subscribeToPhoto, unsubscribeChannel, triggerFloatingEmoji } from '../services/pusher.js';
import { audioManager } from '../services/audioManager.js';
import { doodleLayer, doodle } from './Doodles.js';

/** Reaction emoji offered under every photograph. */
const REACTIONS = ['🔥', '❤️', '🎉', '😂', '✨'];

/**
 * How the contact sheet can be ordered. A shared album is deliberately casual
 * about sequence, so the default is the honest one — the order things arrived —
 * and the other two are there for people who want a handle.
 */
const SORTS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'loved', label: 'Loved' },
];

export class PhotoGallery extends UIComponent {
  constructor(props) {
    super(props);
    this.photos = props.photos || [];
    this.selectedIndex = null;
    this.showRecorder = false;
    this.sort = 'newest';

    this.activeAudioId = null;
    this.currentPhotoChannel = null;

    /** The lightbox lives at body level, so it owns its listeners separately. */
    this._lightboxHost = null;
    this._lightboxListeners = [];

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.touchStartX = 0;
    this._keydownBound = false;
  }

  onMount() {
    // Open a frame
    this.delegate('click', '.btn-open-photo', (e, target) => {
      this.openLightboxAt(parseInt(target.closest('.btn-open-photo').dataset.index, 10));
    });

    // Frames are focusable, so honour keyboard activation too
    this.delegate('keydown', '.btn-open-photo', (e, target) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      this.openLightboxAt(parseInt(target.closest('.btn-open-photo').dataset.index, 10));
    });

    // Re-order the sheet without leaving the album
    this.delegate('click', '.btn-sort', (e, target) => {
      this.sort = target.dataset.sort;
      this.update();
    });

    // Swipe support for mobile lives with the lightbox host, not here: the
    // overlay is rendered outside this element.

    // The lightbox is portalled to <body>, so it needs its own wiring.
    this.mountLightbox();

    // onMount() runs again after every update(), and addEventListener is not
    // idempotent the way mountLightbox's early return is. Left unguarded, each
    // re-render added another copy of the same handler, so one press of the
    // right-arrow key walked N photographs at a time.
    if (!this._keydownBound) {
      this._keydownBound = true;
      document.addEventListener('keydown', this.handleKeyDown);
    }
  }

  onUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
    this._keydownBound = false;
    audioManager.stop();
    if (this.currentPhotoChannel) {
      unsubscribeChannel(this.currentPhotoChannel);
      this.currentPhotoChannel = null;
    }
    this.unmountLightbox();
  }

  // ═══════════════════════════════════════════════════════════
  // Lightbox portal
  // ═══════════════════════════════════════════════════════════

  /**
   * The page wrappers are isolated stacking contexts (they hold the fixed
   * background wash), so an overlay rendered inside them can never paint above
   * the sticky navbar no matter how high its z-index. The lightbox therefore
   * lives in a body-level host that yields its own box entirely.
   */
  mountLightbox() {
    if (this._lightboxHost) return;

    const host = document.createElement('div');
    host.className = 'memora-lightbox-host';
    document.body.appendChild(host);
    this._lightboxHost = host;

    const on = (event, handler) => {
      host.addEventListener(event, handler);
      this._lightboxListeners.push({ event, handler });
    };

    // One listener with an explicit precedence chain. Separate delegated
    // listeners would all fire for a single click, so pressing "next" would
    // also register as a scrim click and close the lightbox.
    on('click', (e) => {
      if (e.target.closest('.btn-close-lightbox')) {
        this.closeLightbox();
        return;
      }
      if (e.target.closest('.btn-next')) {
        this.navigate(1);
        return;
      }
      if (e.target.closest('.btn-prev')) {
        this.navigate(-1);
        return;
      }

      const react = e.target.closest('.btn-react-lightbox');
      if (react) {
        this.handleReaction(react.dataset.emoji);
        return;
      }

      if (e.target.closest('.btn-toggle-record')) {
        this.showRecorder = !this.showRecorder;
        this.update();
        return;
      }

      const play = e.target.closest('.btn-play-audio');
      if (play) {
        audioManager.toggle(play.dataset.id, play.dataset.url, (state) =>
          this.syncAudioUI(play.dataset.id, state)
        );
        return;
      }

      const track = e.target.closest('.audio-progress-track');
      if (track) {
        const rect = track.getBoundingClientRect();
        audioManager.seek(track.dataset.id, (e.clientX - rect.left) / rect.width);
        return;
      }

      // Everything above is a control. What is left is the scrim itself, and
      // only the scrim closes on click — the framed card never does.
      if (!e.target.closest('.memora-lightbox-content')) this.closeLightbox();
    });

    // Swipe support for mobile. Also host-scoped, for the same reason.
    on('touchstart', (e) => {
      if (e.target.closest('.memora-lightbox-content')) return;
      this.touchStartX = e.changedTouches[0].screenX;
    });

    on('touchend', (e) => {
      if (e.target.closest('.memora-lightbox-content')) return;
      const touchEndX = e.changedTouches[0].screenX;
      if (touchEndX < this.touchStartX - 50) this.navigate(1);
      if (touchEndX > this.touchStartX + 50) this.navigate(-1);
    });
  }

  unmountLightbox() {
    for (const { event, handler } of this._lightboxListeners) {
      this._lightboxHost?.removeEventListener(event, handler);
    }
    this._lightboxListeners = [];
    this._lightboxHost?.remove();
    this._lightboxHost = null;
  }

  /** Push the current lightbox markup into the body-level host. */
  syncLightbox() {
    if (!this._lightboxHost) return;
    this._lightboxHost.innerHTML = this.renderLightbox();
    this.refreshIcons();
  }

  // ═══════════════════════════════════════════════════════════
  // Ordering
  // ═══════════════════════════════════════════════════════════

  /**
   * The photographs in display order. Every index in the DOM and in the
   * lightbox refers to this list, never to the raw `photos` array.
   */
  orderedPhotos() {
    if (this.sort === 'oldest') {
      return [...this.photos].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }
    if (this.sort === 'loved') {
      return [...this.photos].sort(
        (a, b) =>
          (b.reactions?.length || 0) - (a.reactions?.length || 0) ||
          new Date(b.createdAt) - new Date(a.createdAt)
      );
    }
    // "newest" is the order the album already holds them in — the order they
    // arrived. Deliberately not re-sorted, so a fresh upload never reshuffles
    // the sheet under someone reading it.
    return [...this.photos];
  }

  // ═══════════════════════════════════════════════════════════
  // Lightbox behaviour
  // ═══════════════════════════════════════════════════════════

  openLightboxAt(index) {
    const photo = this.orderedPhotos()[index];
    if (!photo) return;
    this.selectedIndex = index;
    this.showRecorder = false;
    this.setupRealtimePhoto(photo.id);
    this.update();
  }

  closeLightbox() {
    this.selectedIndex = null;
    audioManager.stop();
    if (this.currentPhotoChannel) {
      unsubscribeChannel(this.currentPhotoChannel);
      this.currentPhotoChannel = null;
    }
    this.update();
  }

  handleKeyDown(e) {
    if (this.selectedIndex === null) return;
    if (e.key === 'Escape') this.closeLightbox();
    else if (e.key === 'ArrowRight') this.navigate(1);
    else if (e.key === 'ArrowLeft') this.navigate(-1);
  }

  navigate(direction) {
    if (this.selectedIndex === null) return;
    const photos = this.orderedPhotos();
    const newIndex = this.selectedIndex + direction;
    if (newIndex < 0 || newIndex >= photos.length) return;

    audioManager.stop();
    this.selectedIndex = newIndex;
    this.showRecorder = false;
    this.setupRealtimePhoto(photos[newIndex].id);
    this.update();
  }

  setupRealtimePhoto(photoId) {
    if (this.currentPhotoChannel) unsubscribeChannel(this.currentPhotoChannel);
    this.currentPhotoChannel = `photo-${photoId}`;

    /** Only re-render if the frame on screen really is the one that changed. */
    const isOnScreen = () => {
      if (this.selectedIndex === null) return false;
      return this.orderedPhotos()[this.selectedIndex]?.id === photoId;
    };

    const apply = (data, listKey) => {
      const photo = this.photos.find((p) => p.id === photoId);
      if (!photo) return;
      if (!photo[listKey]) photo[listKey] = [];
      if (photo[listKey].some((item) => item.id === data.id)) return;
      photo[listKey].unshift(data);
      if (isOnScreen()) this.update();
    };

    subscribeToPhoto(photoId, {
      onReactionAdded: (data) => apply(data, 'reactions'),
      onAudioAdded: (data) => apply(data, 'audioNotes'),
    });
  }

  async handleReaction(emoji) {
    const photo = this.orderedPhotos()[this.selectedIndex];
    if (!photo) return;

    try {
      const reaction = await api.post('/reactions', { photoId: photo.id, emoji });

      // Local optimistic update
      if (!photo.reactions) photo.reactions = [];
      if (!photo.reactions.some((r) => r.id === reaction.id)) {
        photo.reactions.unshift(reaction);
      }

      triggerFloatingEmoji(emoji);
      this.update();
    } catch (err) {
      if (err.message.includes('already reacted')) triggerFloatingEmoji(emoji);
    }
  }

  syncAudioUI(audioId, { isPlaying, progress }) {
    this.activeAudioId = isPlaying ? audioId : null;

    // Lucide swaps the <i> placeholder for an <svg> but keeps the data-lucide
    // attribute on it, so target the attribute — not the tag — or nothing matches.
    for (const button of document.querySelectorAll('.btn-play-audio')) {
      const isActive = button.dataset.id === audioId && isPlaying;
      button
        .querySelector('[data-lucide]')
        ?.setAttribute('data-lucide', isActive ? 'pause' : 'play');
      button.setAttribute(
        'aria-label',
        isActive ? 'Pause voice note' : 'Play voice note'
      );
    }
    this.refreshIcons();

    if (progress !== null) {
      const bar = document.getElementById(`progress-${audioId}`);
      if (bar) bar.style.width = `${progress}%`;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Editorial helpers
  // ═══════════════════════════════════════════════════════════

  /** "8 – 9 Aug 2025", collapsing to a single day or month when it can. */
  dateRange() {
    const times = this.photos
      .map((p) => new Date(p.createdAt).getTime())
      .filter((t) => !Number.isNaN(t));
    if (times.length === 0) return '';

    const first = new Date(Math.min(...times));
    const last = new Date(Math.max(...times));
    const sameDay = first.toDateString() === last.toDateString();
    const sameMonth =
      first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth();

    if (sameDay) {
      return first.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
    if (sameMonth) {
      const month = last.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      return `${first.getDate()} – ${last.getDate()} ${month}`;
    }
    return `${first.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    })} – ${last.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }

  /** Distinct people who added something, for the sheet's subtitle. */
  contributors() {
    const names = [...new Set(this.photos.map((p) => p.uploader?.username).filter(Boolean))];
    if (names.length === 0) return '';
    if (names.length === 1) return `@${names[0]}`;
    if (names.length === 2) return `@${names[0]} and @${names[1]}`;
    return `${names.length} people`;
  }

  // ═══════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════

  render() {
    if (this.photos.length === 0) {
      return `
        <div class="memora-empty memora-reveal" style="max-width: 32rem;">
          <div class="memora-empty-mark"><i data-lucide="image" aria-hidden="true"></i></div>
          <h3>No photographs here yet</h3>
          <p>Add a few and this becomes a place to wander through them — no ordering and no captions required, just the day as it happened.</p>
        </div>
      `;
    }

    const photos = this.orderedPhotos();
    const range = this.dateRange();
    const people = this.contributors();

    return `
      <section class="memora-contact-sheet memora-sheet memora-doodle-host" aria-label="Album photographs">
        ${doodleLayer(
          [
            [
              doodle.cameraDoodle,
              {
                className: 'memora-doodle memora-doodle-size-md memora-float',
                style: 'top: 0.85rem; right: 1.4rem; --memora-tilt: 5deg;',
              },
            ],
            [
              doodle.scribbleUnderline,
              {
                className: 'memora-doodle memora-doodle-size-sm',
                style: 'bottom: -0.85rem; left: 16%; --memora-tilt: -2deg;',
              },
            ],
          ],
          'memora-doodles-faint'
        )}

        <header class="memora-sheet-head">
          <div class="memora-sheet-head-copy">
            <p class="memora-kicker">Contact sheet</p>
            <h3 class="memora-sheet-title memora-sheet-title-lg">
              ${photos.length} ${photos.length === 1 ? 'photograph' : 'photographs'}
            </h3>
            <p class="memora-sheet-copy">
              ${range ? `<span class="memora-sheet-range">${range}</span>` : ''}
              ${range && people ? '<span class="memora-frame-dot" aria-hidden="true">·</span>' : ''}
              ${people ? `<span>Kept by ${people}</span>` : ''}
            </p>
          </div>

          <div class="memora-sheet-tools">
            <span class="memora-tools-label" id="sheet-sort-label">Order</span>
            <div class="memora-segmented" role="group" aria-labelledby="sheet-sort-label">
              ${SORTS.map(
                (option) => `
                <button
                  type="button"
                  data-sort="${option.id}"
                  class="btn-sort memora-segment${this.sort === option.id ? ' is-active' : ''}"
                  aria-pressed="${this.sort === option.id}"
                >${option.label}</button>`
              ).join('')}
            </div>
          </div>
        </header>

        <ol class="memora-contact-grid">
          ${photos.map((photo, index) => this.renderFrame(photo, index)).join('')}
        </ol>
      </section>
    `;
  }

  renderFrame(photo, index) {
    const number = String(index + 1).padStart(2, '0');
    const notes = photo.audioNotes?.length || 0;
    const reactions = photo.reactions?.length || 0;
    const who = photo.uploader?.username;

    return `
      <li class="memora-frame memora-reveal" style="--memora-reveal-delay: ${Math.min(index, 10) * 45}ms">
        <div
          data-index="${index}"
          role="button"
          tabindex="0"
          class="btn-open-photo memora-frame-hit"
          aria-label="Open photograph ${number}${photo.caption ? `: ${photo.caption}` : ''}"
        >
          <div class="memora-frame-plate">
            <img
              src="${photo.r2Url}"
              alt="${photo.caption || 'Shared memory'}"
              loading="lazy"
              decoding="async"
            />
            <span class="memora-frame-no" aria-hidden="true">${number}</span>
            ${
              notes || reactions
                ? `<span class="memora-frame-stamps" aria-hidden="true">
                     ${notes ? `<span class="memora-stamp"><i data-lucide="mic"></i>${notes}</span>` : ''}
                     ${reactions ? `<span class="memora-stamp"><i data-lucide="heart"></i>${reactions}</span>` : ''}
                   </span>`
                : ''
            }
          </div>

          <div class="memora-frame-caption">
            <p class="memora-frame-text${photo.caption ? '' : ' memora-frame-text-quiet'}">
              ${photo.caption || 'No caption'}
            </p>
            <p class="memora-frame-by">
              ${who ? `@${who}` : 'Shared'}
              <span class="memora-frame-dot" aria-hidden="true">·</span>
              ${new Date(photo.createdAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
              })}
            </p>
          </div>
        </div>
      </li>
    `;
  }

  renderLightbox() {
    if (this.selectedIndex === null) return '';

    const photos = this.orderedPhotos();
    const photo = photos[this.selectedIndex];
    if (!photo) return '';

    const position = this.selectedIndex + 1;
    const total = photos.length;
    const number = String(position).padStart(2, '0');
    const audioNotes = photo.audioNotes || [];

    return `
      <div class="lightbox-overlay memora-lightbox" role="dialog" aria-modal="true" aria-label="Photograph ${position} of ${total}">
        <button class="btn-close-lightbox memora-lightbox-close" aria-label="Close photo">
          <i data-lucide="x" aria-hidden="true"></i>
        </button>

        ${
          this.selectedIndex > 0
            ? `<button class="btn-prev memora-lightbox-nav memora-lightbox-nav-prev" aria-label="Previous photo">
                 <i data-lucide="chevron-left" aria-hidden="true"></i>
               </button>`
            : ''
        }
        ${
          this.selectedIndex < total - 1
            ? `<button class="btn-next memora-lightbox-nav memora-lightbox-nav-next" aria-label="Next photo">
                 <i data-lucide="chevron-right" aria-hidden="true"></i>
               </button>`
            : ''
        }

        <div class="lightbox-content memora-lightbox-content">
          <figure class="memora-lightbox-stage">
            <div class="memora-lightbox-plate">
              <img src="${photo.r2Url}" alt="${photo.caption || 'Shared memory'}" />
            </div>

            <figcaption class="memora-lightbox-caption">
              <p class="memora-lightbox-quote${photo.caption ? '' : ' memora-lightbox-quote-quiet'}">
                ${photo.caption || 'No caption for this one'}
              </p>
              <p class="memora-lightbox-counter">
                <span class="memora-frame-no memora-frame-no-static" aria-hidden="true">${number}</span>
                <span>Frame ${position} of ${total}</span>
                <span class="memora-frame-dot" aria-hidden="true">·</span>
                <span>${new Date(photo.createdAt).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}</span>
              </p>
            </figcaption>
          </figure>

          <aside class="memora-lightbox-panel">
            <div class="memora-lightbox-id">
              <span class="memora-lightbox-avatar" aria-hidden="true">${(photo.uploader?.username || 'U')[0].toUpperCase()}</span>
              <div>
                <p class="memora-lightbox-name">@${photo.uploader?.username || 'user'}</p>
                <p class="memora-lightbox-date">Added this to the album</p>
              </div>
            </div>

            <div class="memora-lightbox-section">
              <div class="memora-lightbox-section-head">
                <h4 class="memora-lightbox-label">
                  <i data-lucide="mic" aria-hidden="true"></i>
                  <span>Voice notes</span>
                </h4>
                <button
                  class="btn-toggle-record memora-lightbox-mic${this.showRecorder ? ' is-active' : ''}"
                  aria-label="${this.showRecorder ? 'Close recorder' : 'Record a voice note'}"
                  aria-pressed="${this.showRecorder}"
                >
                  <i data-lucide="${this.showRecorder ? 'x' : 'mic'}" aria-hidden="true"></i>
                </button>
              </div>

              ${this.showRecorder ? '<div id="gallery-audio-recorder" class="memora-lightbox-recorder"></div>' : ''}

              <div class="memora-lightbox-notes">
                ${
                  audioNotes.length === 0 && !this.showRecorder
                    ? `<p class="memora-lightbox-blank">Nothing here yet. Say the thing you would have typed.</p>`
                    : audioNotes
                        .map((note) => {
                          const isPlaying = this.activeAudioId === note.id;
                          const senderName = note.user?.username || note.userId.split('_')[1] || 'user';

                          return `
                          <div class="memora-voice-note">
                            <div class="memora-voice-head">
                              <span class="memora-voice-who">@${senderName}</span>
                              <span class="memora-voice-len">${note.duration}s</span>
                            </div>
                            <div class="memora-voice-body">
                              <button
                                data-id="${note.id}"
                                data-url="${note.audioUrl}"
                                class="btn-play-audio memora-voice-play"
                                aria-label="${isPlaying ? 'Pause voice note' : 'Play voice note'}"
                              >
                                <i data-lucide="${isPlaying ? 'pause' : 'play'}" aria-hidden="true"></i>
                              </button>
                              <div
                                data-id="${note.id}"
                                class="audio-progress-track memora-voice-track"
                                role="slider"
                                tabindex="0"
                                aria-label="Scrub voice note"
                                aria-valuemin="0"
                                aria-valuemax="100"
                                aria-valuenow="0"
                              >
                                <div id="progress-${note.id}" class="memora-voice-fill" aria-hidden="true"></div>
                                <div class="memora-voice-wave" aria-hidden="true">
                                  ${Array.from({ length: 22 })
                                    .map(() => {
                                      const h = 22 + Math.round(Math.random() * 78);
                                      return `<span style="height: ${h}%"></span>`;
                                    })
                                    .join('')}
                                </div>
                              </div>
                            </div>
                          </div>`;
                        })
                        .join('')
                }
              </div>
            </div>

            <div class="memora-lightbox-section memora-lightbox-reactions">
              <h4 class="memora-lightbox-label">
                <i data-lucide="sparkles" aria-hidden="true"></i>
                <span>React</span>
              </h4>
              <div class="memora-reaction-row">
                ${REACTIONS.map(
                  (emoji) => `
                  <button data-emoji="${emoji}" class="btn-react-lightbox memora-reaction" aria-label="React with ${emoji}">
                    ${emoji}
                  </button>`
                ).join('')}
              </div>
            </div>
          </aside>
        </div>
      </div>
    `;
  }

  onUpdate() {
    this.syncLightbox();

    if (this.showRecorder && this.selectedIndex !== null) {
      const photo = this.orderedPhotos()[this.selectedIndex];
      // The recorder lives in the lightbox portal, so resolve its slot there.
      const slot = this._lightboxHost?.querySelector('#gallery-audio-recorder');
      if (!photo || !slot) return;
      this.mountChild(
        'galleryRecorder',
        new AudioRecorder({
          photoId: photo.id,
          onRecorded: (newNote) => {
            if (!photo.audioNotes) photo.audioNotes = [];
            photo.audioNotes.unshift(newNote);
            this.showRecorder = false;
            this.update();
          },
        }),
        slot
      );
    }
  }
}
