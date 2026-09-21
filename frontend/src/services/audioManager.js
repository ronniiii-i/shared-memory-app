class AudioManager {
  constructor() {
    this.currentAudio = null;
    this.activeAudioId = null;
    this.listeners = new Map();
  }

  toggle(audioId, url, onSync) {
    // Register the UI callback for this specific audio note
    this.listeners.set(audioId, onSync);

    // Pause current if clicking the same track
    if (this.currentAudio && this.activeAudioId === audioId) {
      if (this.currentAudio.paused) this.currentAudio.play();
      else this.currentAudio.pause();
      return;
    }

    // Stop existing audio to prevent overlap
    this.stop();

    // Start new track
    this.activeAudioId = audioId;
    this.currentAudio = new Audio(url);

    this.currentAudio.addEventListener('play', () => this.notify(audioId, true, 0));
    this.currentAudio.addEventListener('pause', () => this.notify(audioId, false));
    this.currentAudio.addEventListener('ended', () => this.notify(audioId, false, 0));

    this.currentAudio.addEventListener('timeupdate', () => {
      const progress = (this.currentAudio.currentTime / this.currentAudio.duration) * 100;
      this.notify(audioId, !this.currentAudio.paused, progress || 0);
    });

    this.currentAudio.play();
  }

  seek(audioId, percent) {
    if (this.currentAudio && this.activeAudioId === audioId) {
      this.currentAudio.currentTime = percent * this.currentAudio.duration;
    }
  }

  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.notify(this.activeAudioId, false, 0);
      this.currentAudio = null;
    }
    this.activeAudioId = null;
  }

  notify(audioId, isPlaying, progress = null) {
    const callback = this.listeners.get(audioId);
    if (callback) callback({ isPlaying, progress });
  }
}

export const audioManager = new AudioManager();