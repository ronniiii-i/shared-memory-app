import { UIComponent } from '../core/UIComponent.js';
import { api } from '../services/api.js';
import { toast } from './Toast.js';

export class AudioRecorder extends UIComponent {
  constructor(props) {
    super(props);
    this.photoId = props.photoId;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.secondsLeft = 10;
    this.timerInterval = null;
  }

  onMount() {
    this.delegate('click', '.btn-toggle-record-action', () => {
      if (this.isRecording) this.stopRecording();
      else this.startRecording();
    });
  }

  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        await this.uploadAudioNote(audioBlob);
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.secondsLeft = 10;
      this.update();

      this.timerInterval = setInterval(() => {
        this.secondsLeft -= 1;
        if (this.secondsLeft <= 0) {
          this.stopRecording();
        } else {
          const timerEl = this.$('.record-timer');
          if (timerEl) timerEl.textContent = `0:0${this.secondsLeft}`;
        }
      }, 1000);

    } catch (err) {
      toast.error(`Microphone access error: ${err.message}`);
    }
  }

  stopRecording() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }
    this.isRecording = false;
    this.update();
  }

  async uploadAudioNote(audioBlob) {
    const filename = `voice-note-${Date.now()}.webm`;
    const duration = 10 - this.secondsLeft;

    try {
      const { uploadUrl, publicUrl } = await api.post('/audio/generate-url', {
        filename,
        contentType: 'audio/webm',
      });

      await api.uploadToPresignedUrl(uploadUrl, audioBlob, 'audio/webm');

      const audioNote = await api.post('/audio/confirm', {
        photoId: this.photoId,
        publicUrl,
        duration: Math.max(1, duration),
      });

      if (this.props.onRecorded) {
        this.props.onRecorded(audioNote);
      }
    } catch (err) {
      toast.error(`Failed to save voice note: ${err.message}`);
    }
  }

  render() {
    return `
      <div class="memora-recorder">
        <div class="memora-recorder-state">
          <span class="memora-recorder-dot${this.isRecording ? ' is-live' : ''}" aria-hidden="true"></span>
          <span class="memora-recorder-label">${this.isRecording ? 'Recording…' : 'Ready to record'}</span>
        </div>

        <div class="memora-recorder-actions">
          <span class="record-timer memora-recorder-timer">0:${this.secondsLeft.toString().padStart(2, '0')}</span>
          <button
            class="btn-toggle-record-action memora-recorder-button${this.isRecording ? ' is-live' : ''}"
            aria-label="${this.isRecording ? 'Stop recording' : 'Start recording'}"
          >
            <i data-lucide="${this.isRecording ? 'square' : 'mic'}" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;
  }
}