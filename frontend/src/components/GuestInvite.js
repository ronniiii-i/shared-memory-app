import { UIComponent } from '../core/UIComponent.js';
import QRCode from 'qrcode';
import { api } from '../services/api.js';
import { toast } from './Toast.js';

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
      <div class="glass-panel p-8 rounded-3xl border border-slate-800 shadow-2xl max-w-lg mx-auto">
        <h3 class="font-bold text-lg text-white mb-2 flex items-center gap-2 font-heading">
          <i data-lucide="share-2" class="w-5 h-5 text-purple-400"></i>
          <span>Guest Invite & Access</span>
        </h3>
        <p class="text-xs text-slate-400 mb-6 leading-relaxed">
          Share this link or QR code with friends so they can view and contribute photos.
        </p>

        <!-- QR Code -->
        ${this.qrCodeDataUrl ? `
          <div class="flex flex-col items-center justify-center mb-6">
            <div class="bg-white p-4 rounded-2xl shadow-xl border border-slate-200">
              <img src="${this.qrCodeDataUrl}" alt="Album Invite QR Code" class="w-48 h-48" />
            </div>
            <p class="text-xs text-slate-400 mt-2 flex items-center gap-1">
              <i data-lucide="qr-code" class="w-3.5 h-3.5 text-purple-400"></i>
              <span>Scan with phone camera to join</span>
            </p>
          </div>
        ` : ''}

        <!-- Short Link -->
        <div class="mb-6">
          <label for="share-link-input" class="block text-xs font-semibold text-slate-300 mb-1.5">Shareable Short-Link</label>
          <div class="flex gap-2">
            <input type="text" id="share-link-input" readonly value="${inviteUrl}" class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-purple-300 font-mono select-all focus:outline-none" />
            <button class="btn-copy-link px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs rounded-xl transition-all hover:scale-105 cursor-pointer flex items-center gap-1.5" aria-label="Copy invite link">
              <i data-lucide="${this.copied ? 'check' : 'copy'}" class="w-4 h-4"></i>
              <span>${this.copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <!-- Passcode Setting -->
        <div class="pt-6 border-t border-slate-800">
          <label for="passcode-input" class="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <i data-lucide="lock" class="w-3.5 h-3.5 text-purple-400"></i>
            <span>Required Passcode (Optional)</span>
          </label>
          <div class="flex gap-2">
            <input type="text" id="passcode-input" placeholder="e.g. vibe2026" value="${this.album.passcode || ''}" class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500" />
            <button class="btn-save-passcode px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl cursor-pointer transition-colors" aria-label="Save passcode">
              Save Passcode
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
