import { UIComponent } from '../core/UIComponent.js';
import { compressImage } from '../services/compress.js';
import { api } from '../services/api.js';
import { toast } from './Toast.js';
import { doodleLayer, doodle } from './Doodles.js';

/**
 * Two steps, not one.
 *
 * Selecting a file used to start the upload on the spot, which left the user
 * no chance to write a caption — the upload had already finished by the time
 * they thought of one, and the album had been navigated away from. Choosing a
 * photograph should be reversible; committing to it should not.
 *
 * So a selection only fills a review list. Each entry keeps its own caption,
 * because one caption cannot honestly describe four different photographs.
 * Nothing is sent anywhere until the confirm button is pressed.
 */
export class PhotoUploader extends UIComponent {
  constructor(props) {
    super(props);
    this.albumId = props.albumId;
    this.isUploading = false;
    this.uploadProgress = '';

    /** @type {Array<{uid: string, file: File, url: string, caption: string, error: string}>} */
    this.pending = [];
    this._uid = 0;
  }

  onMount() {
    this.delegate('change', '#photo-file-input', (e) => {
      this.handleFileSelect(e.target.files);
      // Selecting the same file twice in a row has to fire again, and an
      // <input type="file"> keeps its value until something clears it.
      e.target.value = '';
    });

    // Captions are mirrored into state on every keystroke. update() replaces
    // the DOM wholesale, so a caption that only lived in the input would be
    // lost the moment another file was added or removed.
    this.delegate('input', '[data-caption-for]', (e, target) => {
      const item = this.pending.find((entry) => entry.uid === target.dataset.captionFor);
      if (item) item.caption = target.value;
    });

    this.delegate('click', '.btn-remove-pending', (e, target) => {
      this.removePending(target.dataset.removePending);
    });

    this.delegate('click', '.btn-clear-pending', () => {
      this.clearPending();
      this.update();
    });

    this.delegate('click', '.btn-confirm-upload', () => {
      this.confirmUpload();
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
        this.handleFileSelect(e.dataTransfer.files);
      });
    }
  }

  onUnmount() {
    // Object URLs outlive the blob they point at until they are revoked, so a
    // tab switch mid-review would otherwise leak a decoded image per entry.
    this.clearPending();
  }

  handleFileSelect(fileList) {
    if (!fileList || fileList.length === 0) return;

    // accept="image/*" filters the file dialog but not a drag-and-drop, and a
    // rejected non-image used to fail much later with an opaque upload error.
    const chosen = Array.from(fileList);
    const images = chosen.filter((file) => file.type.startsWith('image/'));

    if (images.length === 0) {
      toast.error('Only photographs can be added to an album.');
      return;
    }
    if (images.length < chosen.length) {
      toast.error(`Skipped ${chosen.length - images.length} file(s) that are not photographs.`);
    }

    for (const file of images) {
      this._uid += 1;
      this.pending.push({
        uid: `p${this._uid}`,
        file,
        url: URL.createObjectURL(file),
        caption: '',
        error: '',
      });
    }

    this.update();
  }

  removePending(uid) {
    const index = this.pending.findIndex((entry) => entry.uid === uid);
    if (index === -1) return;
    URL.revokeObjectURL(this.pending[index].url);
    this.pending.splice(index, 1);
    this.update();
  }

  clearPending() {
    for (const entry of this.pending) URL.revokeObjectURL(entry.url);
    this.pending = [];
  }

  async confirmUpload() {
    if (this.isUploading || this.pending.length === 0) return;

    const batch = this.pending;
    const failed = [];
    let uploaded = 0;

    this.isUploading = true;
    this.update();

    for (let i = 0; i < batch.length; i += 1) {
      const item = batch[i];
      this.uploadProgress = `Optimizing ${i + 1}/${batch.length}...`;
      this.update();

      try {
        const compressedFile = await compressImage(item.file);

        this.uploadProgress = `Uploading ${i + 1}/${batch.length}...`;
        this.update();

        const { uploadUrl, publicUrl } = await api.post('/upload/generate-url', {
          folder: 'photos',
          filename: compressedFile.name,
          contentType: 'image/webp',
        });

        await api.uploadToPresignedUrl(uploadUrl, compressedFile, 'image/webp');

        await api.post('/upload/confirm-photo', {
          albumId: this.albumId,
          publicUrl,
          caption: item.caption.trim(),
        });

        uploaded += 1;
        URL.revokeObjectURL(item.url);
      } catch (err) {
        item.error = err.message;
        failed.push(item);
      }
    }

    this.pending = failed;
    this.isUploading = false;
    this.uploadProgress = '';
    this.update();

    if (uploaded > 0) {
      toast.success(
        uploaded === 1 ? 'Photograph added to the album.' : `${uploaded} photographs added to the album.`
      );
    }

    if (failed.length > 0) {
      toast.error(
        `Could not upload ${failed.length} ${failed.length === 1 ? 'photograph' : 'photographs'}. The rest stayed behind so you can try again.`
      );
      // Stay put. Leaving for the gallery now would take the failures with it.
      return;
    }

    if (uploaded > 0 && this.props.onUploadComplete) {
      await this.props.onUploadComplete();
    }
  }

  renderReviewList() {
    if (this.pending.length === 0) return '';

    const count = this.pending.length;

    return `
      <div class="memora-review">
        <div class="memora-review-head">
          <p class="memora-label">
            ${count} ${count === 1 ? 'photograph' : 'photographs'} ready
            <span class="memora-label-quiet">not uploaded yet</span>
          </p>
          <button type="button" class="btn-clear-pending memora-pill memora-pill-quiet">
            Clear all
          </button>
        </div>

        <ul class="memora-review-list">
          ${this.pending
            .map(
              (item) => `
            <li class="memora-review-item${item.error ? ' is-failed' : ''}">
              <img class="memora-review-thumb" src="${item.url}" alt="" />

              <div class="memora-review-body">
                <p class="memora-review-name">${this.escapeHtml(item.file.name)}</p>
                <label class="memora-label memora-label-quiet" for="caption-${item.uid}">Caption</label>
                <input
                  type="text"
                  id="caption-${item.uid}"
                  class="memora-control memora-review-caption"
                  placeholder="A place, a feeling, an inside joke..."
                  value="${this.escapeHtml(item.caption)}"
                  data-caption-for="${item.uid}"
                />
                ${
                  item.error
                    ? `<p class="memora-review-error">${this.escapeHtml(item.error)}</p>`
                    : ''
                }
              </div>

              <button
                type="button"
                class="btn-remove-pending memora-review-remove"
                data-remove-pending="${item.uid}"
                aria-label="Remove ${this.escapeHtml(item.file.name)} from this batch"
              ><i data-lucide="x" aria-hidden="true"></i></button>
            </li>`
            )
            .join('')}
        </ul>

        <div class="memora-review-footer">
          <p class="memora-action-note">
            Each caption is optional and can be changed later.
          </p>
          <button type="button" class="btn-confirm-upload memora-button">
            <i data-lucide="image-plus" aria-hidden="true"></i>
            <span>Add ${count} ${count === 1 ? 'photograph' : 'photographs'}</span>
          </button>
        </div>
      </div>
    `;
  }

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  render() {
    return `
      <section class="memora-panel memora-doodle-host max-w-3xl mx-auto">
        ${doodleLayer(
          [
            [doodle.cameraDoodle, { className: 'memora-doodle memora-doodle-size-sm memora-float', style: 'top: 5rem; right: -1rem; --memora-tilt: -6deg;' }],
            [doodle.squiggle, { className: 'memora-doodle memora-doodle-size-sm', style: 'bottom: -0.6rem; left: 2.5rem; --memora-tilt: 4deg;' }],
          ],
          'memora-doodles-honey memora-doodles-faint'
        )}

        <div class="memora-panel-mark"><i data-lucide="image-plus"></i></div>
        <h3 class="font-serif-heading text-2xl font-bold text-heading mb-2 flex items-center gap-2">
          <span>Add to the memory table</span>
        </h3>
        <p class="text-sm text-muted mb-6 leading-relaxed">
          Choose your photographs, give them a note if you like, then add them all at once. Nothing is uploaded until you press the button.
        </p>

        ${
          this.isUploading
            ? `
          <div class="memora-drop-zone is-dragging">
            <div class="py-4">
              <div class="loader-spinner mx-auto mb-3">
                <div class="spinner-ring"></div>
              </div>
              <p class="text-xs font-semibold text-[var(--accent-sienna)] animate-pulse">${this.uploadProgress}</p>
            </div>
          </div>
        `
            : `
          <div id="drop-zone" class="memora-drop-zone">
            <input type="file" id="photo-file-input" multiple accept="image/*" class="memora-file-input" aria-label="Choose photographs to add to this album" />

            <label for="photo-file-input" class="cursor-pointer block">
              <div class="memora-drop-mark">
                <i data-lucide="upload-cloud" class="w-7 h-7"></i>
              </div>
              <p class="text-sm font-semibold text-main">Drop photographs here, or <span class="memora-accent-underline">choose from your device</span></p>
              <p class="text-xs text-muted mt-1">JPG, PNG, or WebP</p>
            </label>
          </div>
        `
        }

        ${this.renderReviewList()}
      </section>
    `;
  }
}
