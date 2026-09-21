import { UIComponent } from '../core/UIComponent.js';
import { compressImage } from '../services/compress.js';
import { api } from '../services/api.js';
import { toast } from './Toast.js';

export class PhotoUploader extends UIComponent {
  constructor(props) {
    super(props);
    this.albumId = props.albumId;
    this.isUploading = false;
    this.uploadProgress = '';
  }

  onMount() {
    this.delegate('change', '#photo-file-input', (e) => {
      if (e.target.files?.length > 0) {
        this.handleFileSelect(e.target.files);
      }
    });

    const dropZone = this.$('#drop-zone');

    if (dropZone) {
      this.on(dropZone, 'dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('is-dragging');
      });

      this.on(dropZone, 'dragleave', () => {
        dropZone.classList.remove('is-dragging');
      });

      this.on(dropZone, 'drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('is-dragging');
        if (e.dataTransfer.files.length > 0) {
          this.handleFileSelect(e.dataTransfer.files);
        }
      });
    }
  }

  async handleFileSelect(fileList) {
    if (!fileList || fileList.length === 0) return;

    // Copy to an array immediately to prevent losing references during DOM re-renders
    const files = Array.from(fileList);

    this.isUploading = true;
    const captionInput = this.$('#photo-caption-input');
    const caption = captionInput ? captionInput.value : '';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      this.uploadProgress = `Optimizing ${i + 1}/${files.length}...`;
      this.update();

      try {
        const compressedFile = await compressImage(file);

        this.uploadProgress = `Uploading ${i + 1}/${files.length}...`;
        this.update();

        const { uploadUrl, publicUrl } = await api.post('/upload/generate-url', {
          folder: 'photos',
          filename: compressedFile.name,
          contentType: 'image/webp',
        });

        await api.uploadToPresignedUrl(uploadUrl, compressedFile, 'image/webp');

        const photoRecord = await api.post('/upload/confirm-photo', {
          albumId: this.albumId,
          publicUrl,
          caption,
        });

        if (this.props.onUploadComplete) {
          this.props.onUploadComplete(photoRecord);
        }
      } catch (err) {
        toast.error(`Upload error for ${file.name}: ${err.message}`);
      }
    }

    this.isUploading = false;
    this.uploadProgress = '';
    this.update();
  }

  render() {
    return `
      <div class="memora-panel memora-upload-panel max-w-xl mx-auto">
        <div class="memora-panel-mark"><i data-lucide="image-plus"></i></div>
        <h3 class="font-serif-heading text-2xl font-bold text-heading mb-2 flex items-center gap-2">
          <span>Add to the memory table</span>
        </h3>
        <p class="text-sm text-muted mb-6 leading-relaxed">
          Bring in the photographs that belong to this moment. They will be available in the gallery and on every scrapbook page.
        </p>

        <div id="drop-zone" class="memora-drop-zone">
          <input type="file" id="photo-file-input" multiple accept="image/*" class="hidden" aria-label="Upload photo file selector" />

          ${!this.isUploading ? `
            <label for="photo-file-input" class="cursor-pointer block">
              <div class="memora-drop-mark">
                <i data-lucide="upload-cloud" class="w-7 h-7"></i>
              </div>
              <p class="text-sm font-semibold text-main">Drop photographs here, or <span class="memora-accent-underline">choose from your device</span></p>
              <p class="text-xs text-muted mt-1">JPG, PNG, or WebP</p>
            </label>
          ` : `
            <div class="py-4">
              <div class="loader-spinner mx-auto mb-3">
                <div class="spinner-ring"></div>
              </div>
              <p class="text-xs font-semibold text-[var(--accent-sienna)] animate-pulse">${this.uploadProgress}</p>
            </div>
          `}
        </div>

        <div class="mt-6">
          <label for="photo-caption-input" class="block text-xs font-semibold text-main mb-1.5">A note for this photograph <span class="text-muted font-normal">optional</span></label>
          <input type="text" id="photo-caption-input" placeholder="A place, a feeling, an inside joke..." class="memora-input w-full" />
        </div>
      </div>
    `;
  }
}
