import { UIComponent } from '../core/UIComponent.js';
import { AudioRecorder } from './AudioRecorder.js';
import { store } from '../core/Store.js';
import { triggerFloatingEmoji, subscribeToPhoto, unsubscribeChannel } from '../services/pusher.js';
import { api } from '../services/api.js';
import { audioManager } from '../services/audioManager.js';
import { toast } from './Toast.js';
import { confirmDialog } from './ConfirmDialog.js';

export class PhotoCard extends UIComponent {
  constructor(props) {
    super(props);
    this.photo = props.photo;
    this.onPositionChange = props.onPositionChange;
    this.currentPhotoChannel = `photo-${this.photo.id}`;

    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.currentX = this.photo.layoutX || 0;
    this.currentY = this.photo.layoutY || 0;
    this.rotation = this.photo.rotation || 0;

    this.showAudioRecorder = false;
    this.reactions = this.photo.reactions || [];
    this.audioNotes = this.photo.audioNotes || [];
    this.playingAudioId = null;
  }

  onMount() {
    this.initPhysicsDrag();
    this.setupRealtime();

    this.delegate('click', '.btn-emoji-react', (e, target) => {
      this.handleReaction(target.closest('.btn-emoji-react').dataset.emoji);
    });

    this.delegate('click', '.btn-toggle-audio-recorder', () => {
      this.showAudioRecorder = !this.showAudioRecorder;
      this.update();
    });

    this.delegate('click', '.btn-delete-photo', () => this.handleDelete());

    // Audio Playback & Scrubbing
    this.delegate('click', '.btn-play-audio', (e, target) => {
      const btn = target.closest('.btn-play-audio');
      audioManager.toggle(btn.dataset.id, btn.dataset.url, (state) => this.syncAudioUI(btn.dataset.id, state));
    });

    this.delegate('click', '.audio-progress-track', (e, target) => {
      const track = target.closest('.audio-progress-track');
      const rect = track.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      audioManager.seek(track.dataset.id, percent);
    });
  }

  onUnmount() {
    unsubscribeChannel(this.currentPhotoChannel);
  }

  setupRealtime() {
    subscribeToPhoto(this.photo.id, {
      onReactionAdded: (data) => {
        if (!this.reactions.some((r) => r.id === data.id)) {
          this.reactions.unshift(data);
          this.update();
        }
      },
      onAudioAdded: (data) => {
        if (!this.audioNotes.some((a) => a.id === data.id)) {
          this.audioNotes.unshift(data);
          this.update();
        }
      }
    });
  }

  syncAudioUI(audioId, { isPlaying, progress }) {
    this.playingAudioId = isPlaying ? audioId : null;

    const icon = this.$(`.btn-play-audio[data-id="${audioId}"] i`);
    if (icon) {
      icon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
      if (isPlaying) icon.classList.remove('ml-0.5');
      else icon.classList.add('ml-0.5');
      this.refreshIcons();
    }

    if (progress !== null) {
      const bar = this.$(`#progress-${audioId}`);
      if (bar) bar.style.width = `${progress}%`;
    }
  }

  initPhysicsDrag() {
    const el = this.element;
    if (!el) return;

    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.interactive-control')) return;

      this.isDragging = true;
      this.startX = e.clientX - this.currentX;
      this.startY = e.clientY - this.currentY;

      el.style.zIndex = '100';
      el.setPointerCapture(e.pointerId);

      const onPointerMove = (moveEv) => {
        if (!this.isDragging) return;
        this.currentX = moveEv.clientX - this.startX;
        this.currentY = moveEv.clientY - this.startY;
        el.style.transform = `translate3d(${this.currentX}px, ${this.currentY}px, 0px) rotate(${this.rotation}deg)`;
      };

      const onPointerUp = (upEv) => {
        if (!this.isDragging) return;
        this.isDragging = false;
        el.style.zIndex = '10';
        el.releasePointerCapture(upEv.pointerId);

        el.removeEventListener('pointermove', onPointerMove);
        el.removeEventListener('pointerup', onPointerUp);

        if (this.onPositionChange) {
          this.onPositionChange(this.photo.id, this.currentX, this.currentY, this.rotation);
        }
      };

      el.addEventListener('pointermove', onPointerMove);
      el.addEventListener('pointerup', onPointerUp);
    });
  }

  async handleReaction(emoji) {
    try {
      const reaction = await api.post('/reactions', {
        photoId: this.photo.id,
        emoji,
      });

      this.reactions.unshift(reaction);
      triggerFloatingEmoji(emoji);
      this.update();
    } catch (err) {
      if (err.message.includes('already reacted')) {
        triggerFloatingEmoji(emoji);
      } else {
        toast.error(`Reaction error: ${err.message}`);
      }
    }
  }

  async handleDelete() {
    if (!await confirmDialog({ title: 'Delete this photo?', message: 'This removes the photo from the album for everyone.', confirmLabel: 'Delete photo', destructive: true })) return;
    try {
      await api.delete(`/photos/${this.photo.id}`);
      this.element.remove();
    } catch (err) {
      toast.error(`Could not delete photo: ${err.message}`);
    }
  }


  render() {
    const { photo } = this;
    const canDelete = store.currentUser?.id === photo.uploaderId || store.currentAlbumRole === 'admin';

    return `
      <div id="photo-${photo.id}" 
        tabindex="0"
        class="polaroid-card
        group focus:outline-none focus:ring-2 focus:ring-amber-500 rounded-xl" style="transform: translate3d(${this.currentX}px, ${this.currentY}px, 0px) rotate(${this.rotation}deg); width: 270px;">
        <div class="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-5 bg-amber-200/80 dark:bg-amber-800/60 rotate-[-2deg] shadow-sm pointer-events-none rounded-sm border border-amber-300/40"></div>
        <div class="relative overflow-hidden rounded-md bg-stone-200">
          <img src="${photo.r2Url}" class="w-full h-52 object-cover" />
          ${canDelete ? `
            <button class="btn-delete-photo interactive-control absolute top-2 right-2 p-1.5 bg-red-950/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          ` : ''}
        </div>

        <div class="polaroid-caption mt-2">
          ${photo.caption ? `<p class="text-xs font-semibold text-slate-800 leading-tight">${photo.caption}</p>` : ''}
        </div>

        ${this.audioNotes.length > 0 ? `
          <div class="mt-3 space-y-2">
            ${this.audioNotes.map((note) => {
      const isPlaying = this.playingAudioId === note.id;
      return `
              <div class="flex flex-col gap-1.5 bg-stone-100 dark:bg-stone-800 rounded-xl p-2 border border-stone-200 dark:border-stone-700 shadow-sm interactive-control">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-bold text-stone-600 dark:text-stone-300 truncate">@${note.user?.username || 'user'}</span>
                  <span class="text-[10px] font-semibold text-[var(--accent-sienna)]">${note.duration}s</span>
                </div>
                <div class="flex items-center gap-2">
                  <button data-id="${note.id}" data-url="${note.audioUrl}" class="btn-play-audio w-7 h-7 flex items-center justify-center rounded-full bg-[var(--accent-sienna)] text-white shadow-sm shrink-0 cursor-pointer">
                    <i data-lucide="${isPlaying ? 'pause' : 'play'}" class="w-3.5 h-3.5 ${isPlaying ? '' : 'ml-0.5'}" fill="currentColor"></i>
                  </button>
                  <div data-id="${note.id}" class="audio-progress-track relative flex-1 h-5 bg-stone-200 dark:bg-stone-700 rounded-lg overflow-hidden cursor-pointer flex items-center px-1">
                    <div id="progress-${note.id}" class="absolute left-0 top-0 bottom-0 bg-[var(--accent-sienna)]/40 w-0 transition-all duration-100 ease-linear pointer-events-none"></div>
                    <div class="relative w-full flex items-center justify-between gap-[2px] h-2 opacity-50 pointer-events-none">
                      ${Array.from({ length: 12 }).map(() => `<div class="flex-1 bg-stone-500 dark:bg-stone-400 rounded-full" style="height: ${Math.max(30, Math.random() * 100)}%"></div>`).join('')}
                    </div>
                  </div>
                </div>
              </div>
            `}).join('')}
          </div>
        ` : ''}

        ${this.showAudioRecorder ? `<div class="mt-2 pt-2 border-t border-stone-200 interactive-control" id="audio-recorder-node-${photo.id}"></div>` : ''}

        <div class="mt-3 pt-2 border-t border-stone-200 flex items-center justify-between gap-1 interactive-control">
          <div class="flex items-center gap-1">
            ${['🔥', '❤️', '🎉', '😂', '✨'].map((emoji) => `
              <button data-emoji="${emoji}" class="btn-emoji-react p-1 hover:bg-stone-100 rounded text-sm transition-transform hover:scale-125 cursor-pointer">
                ${emoji}
              </button>
            `).join('')}
          </div>
          <button class="btn-toggle-audio-recorder p-1 hover:bg-stone-100 rounded text-stone-600 hover:text-amber-700 transition-colors cursor-pointer">
            <i data-lucide="mic" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;
  }

  onUpdate() {
    if (this.showAudioRecorder) {
      this.mountChild('audioRecorder', new AudioRecorder({
        photoId: this.photo.id,
        onRecorded: (newNote) => {
          this.showAudioRecorder = false;
        },
      }), `#audio-recorder-node-${this.photo.id}`);
    }
  }
}