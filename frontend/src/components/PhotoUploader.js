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
        dropZone.classList.add('border-purple-500', 'bg-purple-500/10');
      });

      this.on(dropZone, 'dragleave', () => {
        dropZone.classList.remove('border-purple-500', 'bg-purple-500/10');
      });

      this.on(dropZone, 'drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-purple-500', 'bg-purple-500/10');
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
      <div class="glass-panel p-8 rounded-3xl border border-slate-800 shadow-2xl max-w-xl mx-auto">
        <h3 class="font-bold text-lg text-white mb-2 flex items-center gap-2 font-heading">
          <i data-lucide="sparkles" class="w-5 h-5 text-purple-400"></i>
          <span>Add Photos to Scrapbook</span>
        </h3>
        <p class="text-xs text-slate-400 mb-6 leading-relaxed">
          Photos are compressed client-side to lightweight WebP files and uploaded directly to Cloudflare R2 zero-cost storage.
        </p>

        <div id="drop-zone" class="border-2 border-dashed border-slate-700 hover:border-purple-400 rounded-2xl p-10 text-center transition-all cursor-pointer bg-slate-950/40">
          <input type="file" id="photo-file-input" multiple accept="image/*" class="hidden" aria-label="Upload photo file selector" />

          ${!this.isUploading ? `
            <label for="photo-file-input" class="cursor-pointer block">
              <div class="w-14 h-14 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center mx-auto mb-4 border border-purple-500/30">
                <i data-lucide="upload-cloud" class="w-7 h-7"></i>
              </div>
              <p class="text-sm font-semibold text-slate-200">Drag & drop photos here, or <span class="text-purple-400 underline">browse</span></p>
              <p class="text-xs text-slate-500 mt-1">Supports PNG, JPG, WebP</p>
            </label>
          ` : `
            <div class="py-4">
              <div class="loader-spinner mx-auto mb-3">
                <div class="spinner-ring"></div>
              </div>
              <p class="text-xs font-semibold text-purple-300 animate-pulse">${this.uploadProgress}</p>
            </div>
          `}
        </div>

        <div class="mt-6">
          <label for="photo-caption-input" class="block text-xs font-semibold text-slate-300 mb-1.5">Photo Caption (Optional)</label>
          <input type="text" id="photo-caption-input" placeholder="Add a story or caption for this photo..." class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-all" />
        </div>
      </div>
    `;
  }
}
