import { UIComponent } from '../core/UIComponent.js';

export class VibeSummary extends UIComponent {
  constructor(props) {
    super(props);
    this.photos = props.photos || [];
    this.albumTitle = props.albumTitle || 'Album';
  }

  generateSummary() {
    if (this.photos.length === 0) {
      return 'The canvas is fresh and untouched! Add some photos to generate the album vibe summary.';
    }

    const totalPhotos = this.photos.length;
    const uploaderSet = new Set(this.photos.map((p) => p.uploader?.username).filter(Boolean));
    const totalReactions = this.photos.reduce((sum, p) => sum + (p.reactions?.length || 0), 0);
    const totalVoiceNotes = this.photos.reduce((sum, p) => sum + (p.audioNotes?.length || 0), 0);

    const dateMap = new Map();
    this.photos.forEach((photo) => {
      const dateStr = new Date(photo.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1);
    });

    const busiestDate = Array.from(dateMap.entries()).sort((a, b) => b[1] - a[1])[0];

    const contributorText = uploaderSet.size === 1
      ? `@${Array.from(uploaderSet)[0]}`
      : `${uploaderSet.size} creators`;

    let summaryText = `✨ **"${this.albumTitle}" Vibe Report**: Across ${totalPhotos} captured moments, ${contributorText} brought this album to life! `;

    if (busiestDate) {
      summaryText += `The busiest day was **${busiestDate[0]}** with ${busiestDate[1]} drops. `;
    }

    if (totalReactions > 0) {
      summaryText += `It sparked 🔥 **${totalReactions} live reactions** `;
    }

    if (totalVoiceNotes > 0) {
      summaryText += `and 🎙️ **${totalVoiceNotes} voice notes**. `;
    } else {
      summaryText += `. `;
    }

    summaryText += `Overall Vibe Rating: **10/10 Pure Energy ⚡**`;

    return summaryText;
  }

  render() {
    const summaryMarkdown = this.generateSummary();

    return `
      <div class="glass-panel p-8 rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-950/30 via-slate-900/60 to-pink-950/30 shadow-2xl max-w-xl mx-auto my-4">
        <div class="flex items-center gap-3.5 mb-4">
          <div class="w-11 h-11 rounded-2xl bg-purple-600/30 text-purple-300 border border-purple-500/40 flex items-center justify-center text-xl font-bold">
            <i data-lucide="bot" class="w-6 h-6"></i>
          </div>
          <div>
            <h4 class="font-bold text-base text-white font-heading">Auto-Generated Vibe Summary</h4>
            <p class="text-xs text-purple-300">Timeline & engagement insights</p>
          </div>
        </div>

        <div class="p-4 rounded-2xl bg-slate-950/40 border border-purple-500/20 text-xs leading-relaxed text-slate-300 font-sans">
          ${summaryMarkdown.replace(/\*\*(.*?)\*\*/g, '<strong class="text-purple-300 font-semibold">$1</strong>')}
        </div>
      </div>
    `;
  }
}
