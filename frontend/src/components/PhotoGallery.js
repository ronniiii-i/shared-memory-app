import { UIComponent } from '../core/UIComponent.js';
import { AudioRecorder } from './AudioRecorder.js';
import { api } from '../services/api.js';
import { subscribeToPhoto, unsubscribeChannel, triggerFloatingEmoji } from '../services/pusher.js';
import { audioManager } from '../services/audioManager.js';

export class PhotoGallery extends UIComponent {
  constructor(props) {
    super(props);
    this.photos = props.photos || [];
    this.selectedIndex = null;
    this.showRecorder = false;

    this.activeAudioId = null;
    this.currentPhotoChannel = null;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.touchStartX = 0;
  }

  onMount() {
    // Open Lightbox
    this.delegate('click', '.btn-open-photo', (e, target) => {
      this.selectedIndex = parseInt(target.closest('.btn-open-photo').dataset.index, 10);
      this.showRecorder = false;
      this.setupRealtimePhoto(this.photos[this.selectedIndex].id);
      this.update();
    });

    // Close Lightbox
    this.delegate('click', '.btn-close-lightbox, .lightbox-overlay', (e, target) => {
      if (e.target.closest('.lightbox-content') && !e.target.closest('.btn-close-lightbox')) return;
      this.closeLightbox();
    });

    // Navigation
    this.delegate('click', '.btn-next', (e) => {
      e.stopPropagation();
      this.navigate(1);
    });

    this.delegate('click', '.btn-prev', (e) => {
      e.stopPropagation();
      this.navigate(-1);
    });

    // Swipe support for mobile
    this.delegate('touchstart', '.lightbox-overlay', (e) => {
      this.touchStartX = e.changedTouches[0].screenX;
    });

    this.delegate('touchend', '.lightbox-overlay', (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      if (touchEndX < this.touchStartX - 50) this.navigate(1);
      if (touchEndX > this.touchStartX + 50) this.navigate(-1);
    });

    // Interactions
    this.delegate('click', '.btn-react-lightbox', (e, target) => {
      this.handleReaction(target.closest('.btn-react-lightbox').dataset.emoji);
    });

    this.delegate('click', '.btn-toggle-record', () => {
      this.showRecorder = !this.showRecorder;
      this.update();
    });

    // Global Audio Integration
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

    document.addEventListener('keydown', this.handleKeyDown);
  }

  onUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
    audioManager.stop();
    if (this.currentPhotoChannel) {
      unsubscribeChannel(this.currentPhotoChannel);
    }
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
    const newIndex = this.selectedIndex + direction;
    if (newIndex >= 0 && newIndex < this.photos.length) {
      audioManager.stop();
      this.selectedIndex = newIndex;
      this.showRecorder = false;
      this.setupRealtimePhoto(this.photos[this.selectedIndex].id);
      this.update();
    }
  }

  setupRealtimePhoto(photoId) {
    if (this.currentPhotoChannel) unsubscribeChannel(this.currentPhotoChannel);

    this.currentPhotoChannel = `photo-${photoId}`;
    subscribeToPhoto(photoId, {
      onReactionAdded: (data) => {
        const photo = this.photos.find(p => p.id === photoId);
        if (photo) {
          if (!photo.reactions) photo.reactions = [];
          if (!photo.reactions.some(r => r.id === data.id)) {
            photo.reactions.unshift(data);
            if (this.selectedIndex !== null && this.photos[this.selectedIndex].id === photoId) {
              this.update();
            }
          }
        }
      },
      onAudioAdded: (data) => {
        const photo = this.photos.find(p => p.id === photoId);
        if (photo) {
          if (!photo.audioNotes) photo.audioNotes = [];
          if (!photo.audioNotes.some(a => a.id === data.id)) {
            photo.audioNotes.unshift(data);
            if (this.selectedIndex !== null && this.photos[this.selectedIndex].id === photoId) {
              this.update();
            }
          }
        }
      }
    });
  }

  async handleReaction(emoji) {
    const photo = this.photos[this.selectedIndex];
    try {
      const reaction = await api.post('/reactions', { photoId: photo.id, emoji });

      // Local optimistic update
      if (!photo.reactions) photo.reactions = [];
      if (!photo.reactions.some(r => r.id === reaction.id)) {
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

    // Reset all play buttons to 'play' state
    document.querySelectorAll('.btn-play-audio i').forEach(icon => {
      icon.setAttribute('data-lucide', 'play');
      icon.classList.add('ml-0.5');
    });

    // Set the currently active button to 'pause'
    if (isPlaying) {
      const activeIcon = document.querySelector(`.btn-play-audio[data-id="${audioId}"] i`);
      if (activeIcon) {
        activeIcon.setAttribute('data-lucide', 'pause');
        activeIcon.classList.remove('ml-0.5');
      }
    }
    this.refreshIcons();

    if (progress !== null) {
      const bar = document.getElementById(`progress-${audioId}`);
      if (bar) bar.style.width = `${progress}%`;
    }
  }

  render() {
    if (this.photos.length === 0) {
      return `
        <div class="flex flex-col items-center justify-center min-h-[450px] text-center">
          <div class="w-16 h-16 rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-400 flex items-center justify-center mb-4">
            <i data-lucide="image" class="w-8 h-8"></i>
          </div>
          <h3 class="font-serif-heading font-bold text-xl text-heading">No photos yet</h3>
          <p class="text-sm text-muted mt-2">Head to the Canvas or Add Photos tab to start building this album.</p>
        </div>
      `;
    }

    return `
      <div class="gallery-wrapper">
        <!-- Thumbnail Grid -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 mt-6">
          ${this.photos.map((photo, index) => `
            <div data-index="${index}" class="btn-open-photo cursor-pointer group relative aspect-square rounded-2xl overflow-hidden bg-stone-100 dark:bg-stone-900 shadow-sm border border-[var(--border-color)]">
              <img src="${photo.r2Url}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
              <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                ${photo.caption ? `<p class="text-white text-sm font-semibold truncate mb-1">${photo.caption}</p>` : ''}
                <div class="flex items-center gap-3 text-white/80 mt-1">
                   ${photo.audioNotes?.length ? `
                     <div class="flex items-center gap-1">
                       <i data-lucide="mic" class="w-3.5 h-3.5"></i> 
                       <span class="text-[10px] font-bold">${photo.audioNotes.length}</span>
                     </div>
                   ` : ''}
                   ${photo.reactions?.length ? `<span class="text-[10px] ml-auto font-bold">${photo.reactions.length} reacts</span>` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        ${this.renderLightbox()}
      </div>
    `;
  }

  renderLightbox() {
    if (this.selectedIndex === null) return '';

    const photo = this.photos[this.selectedIndex];
    const hasPrev = this.selectedIndex > 0;
    const hasNext = this.selectedIndex < this.photos.length - 1;
    const audioNotes = photo.audioNotes || [];

    return `
      <div class="lightbox-overlay fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center overscroll-contain">
        
        <button class="btn-close-lightbox absolute top-4 right-4 md:top-8 md:right-8 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-[120] cursor-pointer">
          <i data-lucide="x" class="w-6 h-6 pointer-events-none"></i>
        </button>

        ${hasPrev ? `
          <div class="btn-prev absolute left-2 md:left-8 p-3 rounded-full bg-white/5 hover:bg-white/20 text-white transition-colors z-[120] cursor-pointer">
            <i data-lucide="chevron-left" class="w-8 h-8 md:w-6 md:h-6 pointer-events-none"></i>
          </div>
        ` : ''}
        
        ${hasNext ? `
          <div class="btn-next absolute right-2 md:right-8 p-3 rounded-full bg-white/5 hover:bg-white/20 text-white transition-colors z-[120] cursor-pointer">
            <i data-lucide="chevron-right" class="w-8 h-8 md:w-6 md:h-6 pointer-events-none"></i>
          </div>
        ` : ''}

        <div class="lightbox-content relative w-full h-full flex flex-col md:flex-row items-center justify-center p-4 md:p-12 gap-6 md:gap-12 z-[110]">
          
          <!-- Image Container -->
          <div class="relative flex-1 h-[50vh] md:h-full w-full flex flex-col justify-center items-center">
            <img src="${photo.r2Url}" class="max-w-full max-h-full object-contain rounded-xl shadow-2xl drop-shadow-2xl" />
            ${photo.caption ? `
              <div class="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md px-6 py-2.5 rounded-full text-white text-sm font-medium whitespace-nowrap shadow-xl border border-white/10">
                ${photo.caption}
              </div>
            ` : ''}
          </div>

          <!-- Interaction Sidebar -->
          <div class="w-full md:w-[350px] flex flex-col bg-stone-900/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 shadow-2xl h-auto max-h-[40vh] md:max-h-[85vh] overflow-y-auto shrink-0 hidden-scrollbar">
            
            <div class="flex items-center gap-3 mb-6 pb-5 border-b border-white/10">
              <div class="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent-sienna)] to-orange-600 flex items-center justify-center text-white font-bold shadow-inner">
                ${(photo.uploader?.username || 'U')[0].toUpperCase()}
              </div>
              <div>
                <p class="text-white text-sm font-bold tracking-wide">@${photo.uploader?.username || 'user'}</p>
                <p class="text-white/50 text-[10px] mt-0.5">${new Date(photo.createdAt).toLocaleString()}</p>
              </div>
            </div>

            <div class="flex-1 flex flex-col min-h-0">
              <div class="flex items-center justify-between mb-4">
                <h4 class="text-white/80 text-[11px] font-bold uppercase tracking-widest">Voice Notes</h4>
                <button class="btn-toggle-record p-2 rounded-full ${this.showRecorder ? 'bg-[var(--accent-sienna)] text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'} transition-all cursor-pointer">
                  <i data-lucide="${this.showRecorder ? 'x' : 'mic'}" class="w-3.5 h-3.5 pointer-events-none"></i>
                </button>
              </div>

              ${this.showRecorder ? `<div id="gallery-audio-recorder" class="mb-4"></div>` : ''}

              <div class="space-y-3 overflow-y-auto hidden-scrollbar pb-4">
                ${audioNotes.length === 0 && !this.showRecorder ? `
                  <p class="text-white/30 text-xs italic text-center py-6">No voice notes yet. Drop one!</p>
                ` : audioNotes.map(note => {
      const isPlaying = this.activeAudioId === note.id;
      const senderName = note.user?.username || note.userId.split('_')[1] || 'user';

      return `
                    <div class="group flex flex-col gap-2 bg-white/5 border border-white/5 p-3 rounded-2xl">
                      <div class="flex items-center justify-between">
                        <span class="text-white/90 text-xs font-bold truncate">@${senderName}</span>
                        <span class="text-[var(--accent-sienna)] text-[10px] font-semibold">${note.duration}s</span>
                      </div>
                      
                      <div class="flex items-center gap-3">
                        <button data-id="${note.id}" data-url="${note.audioUrl}" class="btn-play-audio w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg shrink-0 cursor-pointer">
                          <i data-lucide="${isPlaying ? 'pause' : 'play'}" class="w-4 h-4 ${isPlaying ? '' : 'ml-0.5'} pointer-events-none" fill="currentColor"></i>
                        </button>
                        
                        <div data-id="${note.id}" class="audio-progress-track relative flex-1 h-8 bg-black/40 rounded-xl overflow-hidden cursor-pointer flex items-center px-2">
                           <div id="progress-${note.id}" class="absolute left-0 top-0 bottom-0 bg-[var(--accent-sienna)]/30 w-0 transition-all duration-100 ease-linear pointer-events-none"></div>
                           <div class="relative w-full flex items-center justify-between gap-[2px] h-3 opacity-60 pointer-events-none">
                             ${Array.from({ length: 20 }).map(() => `<div class="flex-1 bg-white rounded-full" style="height: ${Math.max(20, Math.random() * 100)}%"></div>`).join('')}
                           </div>
                        </div>
                      </div>
                    </div>
                  `;
    }).join('')}
              </div>
            </div>

            <div class="mt-auto pt-4 border-t border-white/10">
              <div class="flex items-center justify-between bg-black/40 p-2.5 rounded-2xl border border-white/5 shadow-inner">
                ${['🔥', '❤️', '🎉', '😂', '✨'].map(emoji => `
                  <button data-emoji="${emoji}" class="btn-react-lightbox w-9 h-9 flex items-center justify-center bg-transparent hover:bg-white/10 rounded-xl text-xl transition-all hover:scale-125 hover:-translate-y-1 cursor-pointer shadow-sm">
                    ${emoji}
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  onUpdate() {
    if (this.showRecorder && this.selectedIndex !== null) {
      const photo = this.photos[this.selectedIndex];
      this.mountChild('galleryRecorder', new AudioRecorder({
        photoId: photo.id,
        onRecorded: (newNote) => {
          if (!photo.audioNotes) photo.audioNotes = [];
          photo.audioNotes.unshift(newNote);
          this.showRecorder = false;
          this.update();
        },
      }), '#gallery-audio-recorder');
    }
  }
}