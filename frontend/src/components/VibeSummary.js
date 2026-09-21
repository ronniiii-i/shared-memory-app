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

    let summaryText = `**"${this.albumTitle}" — a little look back**: Across ${totalPhotos} captured moments, ${contributorText} helped bring this album to life. `;

    if (busiestDate) {
      summaryText += `The busiest day was **${busiestDate[0]}** with ${busiestDate[1]} drops. `;
    }

    if (totalReactions > 0) {
      summaryText += `It sparked **${totalReactions} reactions** `;
    }

    if (totalVoiceNotes > 0) {
      summaryText += `and **${totalVoiceNotes} voice notes**. `;
    } else {
      summaryText += `. `;
    }

    summaryText += `The memory is still warm.`;

    return summaryText;
  }

  render() {
    const summaryMarkdown = this.generateSummary();

    return `
      <div class="memora-panel memora-recap-panel max-w-xl mx-auto my-4">
        <div class="flex items-center gap-3.5 mb-4">
          <div class="memora-panel-mark"><i data-lucide="book-heart" class="w-6 h-6"></i>
          </div>
          <div>
            <h4 class="font-serif-heading font-bold text-2xl text-heading">A note from the album</h4>
            <p class="text-xs text-[var(--accent-leaf)]">Timeline & shared details</p>
          </div>
        </div>

        <div class="memora-recap-copy">
          ${summaryMarkdown.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
        </div>
      </div>
    `;
  }
}
