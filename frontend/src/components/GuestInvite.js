import { UIComponent } from '../core/UIComponent.js';
import QRCode from 'qrcode';
import { api } from '../services/api.js';
import { toast } from './Toast.js';
import { doodleLayer, doodle } from './Doodles.js';

export class GuestInvite extends UIComponent {
  constructor(props) {
    super(props);
    this.album = props.album;
    this.qrCodeDataUrl = '';
    this.copied = false;
    this._fetched = false;
  }

  async onMount() {
    if (!this._fetched) {
      this._fetched = true;
      const inviteUrl = this.getInviteUrl();
      try {
        this.qrCodeDataUrl = await QRCode.toDataURL(inviteUrl, {
          width: 220,
          margin: 2,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        });
        this.update();
      } catch (err) {
        console.warn('QR Code generation failed:', err);
      }
    }

    this.delegate('click', '.btn-copy-link', () => this.copyLink());
    this.delegate('click', '.btn-save-passcode', () => this.savePasscode());
  }

  getInviteUrl() {
    const origin = window.location.origin;
    return `${origin}/#/join/${this.album.shareCode}`;
  }

  copyLink() {
    navigator.clipboard.writeText(this.getInviteUrl());
    this.copied = true;
    this.update();
    setTimeout(() => {
      this.copied = false;
      this.update();
    }, 2000);
  }

  async savePasscode() {
    const input = this.$('#passcode-input');
    if (!input) return;

    const passcode = input.value.trim() || null;
    try {
      const updated = await api.patch(`/albums/${this.album.id}`, { passcode });
      this.album.passcode = updated.passcode;
      toast.success('Album passcode updated successfully!');
      this.update();
    } catch (err) {
      toast.error(`Failed to update passcode: ${err.message}`);
    }
  }

  render() {
    const inviteUrl = this.getInviteUrl();

    return `
      <section class="memora-panel memora-invite-panel memora-doodle-host max-w-lg mx-auto">
        ${doodleLayer(
          [
            [doodle.dashedLoop, { className: 'memora-doodle memora-doodle-size-md memora-drift', style: 'top: 5.5rem; right: -1.75rem; --memora-tilt: 6deg;' }],
            [doodle.squiggle, { className: 'memora-doodle memora-doodle-size-sm', style: 'bottom: -0.6rem; left: 2.5rem; --memora-tilt: -4deg;' }],
          ],
          'memora-doodles-sky memora-doodles-faint'
        )}

        <div class="memora-panel-mark"><i data-lucide="send"></i></div>
        <h3 class="font-serif-heading text-2xl font-bold text-heading mb-2 flex items-center gap-2">
          <span>Make room at the table</span>
        </h3>
        <p class="text-sm text-muted mb-6 leading-relaxed">
          Invite the people who were there. Everyone can add photographs, notes, and little pieces of the story.
        </p>

        <!-- QR Code -->
        ${this.qrCodeDataUrl ? `
          <div class="flex flex-col items-center justify-center mb-6">
            <div class="bg-white p-4 rounded-2xl shadow-xl border border-[var(--border-color)]">
              <img src="${this.qrCodeDataUrl}" alt="Album Invite QR Code" class="w-48 h-48" />
            </div>
            <p class="text-xs text-muted mt-2 flex items-center gap-1">
              <i data-lucide="qr-code" class="w-3.5 h-3.5 text-[var(--accent-sienna)]"></i>
              <span>Scan with phone camera to join</span>
            </p>
          </div>
        ` : ''}

        <!-- Share code — the short form, for copying by hand -->
        <div class="memora-sheet memora-sheet-flat" style="margin-bottom: 1.5rem; text-align: center">
          <span class="memora-kicker">Or type the code in</span>
          <div style="margin-top: 0.5rem">
            <span class="memora-code" style="font-size: 1.1rem; padding: 0.3rem 0.8rem">${this.album.shareCode}</span>
          </div>
        </div>

        <!-- Short Link -->
        <div class="mb-6">
          <label for="share-link-input" class="memora-label">Or send the link</label>
          <div class="memora-field-row">
            <input type="text" id="share-link-input" readonly value="${inviteUrl}" class="memora-control memora-control-mono select-all" />
            <button class="btn-copy-link memora-button" aria-label="Copy invite link">
              <i data-lucide="${this.copied ? 'check' : 'copy'}" aria-hidden="true"></i>
              <span>${this.copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <!-- Passcode Setting -->
        <div class="memora-divider" role="presentation"></div>

        <div>
          <label for="passcode-input" class="memora-label">Keep it among friends <span class="memora-label memora-label-quiet">optional passcode</span></label>
          <div class="memora-field-row">
            <input type="text" id="passcode-input" placeholder="e.g. summer-at-the-lake" value="${this.album.passcode || ''}" class="memora-control memora-control-mono" />
            <button class="btn-save-passcode memora-button memora-button-quiet" aria-label="Save passcode">
              Save
            </button>
          </div>
        </div>
      </section>
    `;
  }
}
