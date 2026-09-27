import { UIComponent } from '../core/UIComponent.js';
import { doodleLayer, doodle } from './Doodles.js';

export class VibeSummary extends UIComponent {
  constructor(props) {
    super(props);
    this.photos = props.photos || [];
    this.albumTitle = props.albumTitle || 'Album';
  }

  /** Single source of truth for the numbers, shared by the prose and the chips. */
  collectStats() {
    const totalPhotos = this.photos.length;
    const uploaderSet = new Set(this.photos.map((p) => p.uploader?.username).filter(Boolean));

    const dateMap = new Map();
    this.photos.forEach((photo) => {
      const dateStr = new Date(photo.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1);
    });

    return {
      totalPhotos,
      uploaderSet,
      contributors: uploaderSet.size,
      totalReactions: this.photos.reduce((sum, p) => sum + (p.reactions?.length || 0), 0),
      totalVoiceNotes: this.photos.reduce((sum, p) => sum + (p.audioNotes?.length || 0), 0),
      busiestDate: Array.from(dateMap.entries()).sort((a, b) => b[1] - a[1])[0],
    };
  }

  generateSummary() {
    if (this.photos.length === 0) {
      return 'The canvas is fresh and untouched! Add some photos to generate the album vibe summary.';
    }

    const { totalPhotos, uploaderSet, contributors, totalReactions, totalVoiceNotes, busiestDate } =
      this.collectStats();

    const contributorText = contributors === 1 ? `@${Array.from(uploaderSet)[0]}` : `${contributors} creators`;

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

  renderStatChips() {
    const { totalPhotos, contributors, totalReactions, totalVoiceNotes } = this.collectStats();

    const chips = [
      { icon: 'image', value: totalPhotos, label: totalPhotos === 1 ? 'photograph' : 'photographs' },
      { icon: 'user-round', value: contributors, label: contributors === 1 ? 'contributor' : 'contributors' },
      { icon: 'heart', value: totalReactions, label: totalReactions === 1 ? 'reaction' : 'reactions' },
      { icon: 'mic', value: totalVoiceNotes, label: totalVoiceNotes === 1 ? 'voice note' : 'voice notes' },
    ];

    // Zero counts are still part of the story, but two empty chips in a row
    // reads as broken data — keep the row to what actually happened.
    const meaningful = chips.filter((chip) => chip.value > 0 || chip.icon === 'image' || chip.icon === 'user-round');

    return `
      <div class="memora-recap-stats">
        ${meaningful
          .map(
            (chip) => `
          <span class="memora-recap-chip">
            <i data-lucide="${chip.icon}" aria-hidden="true"></i>
            <span class="memora-recap-chip-value">${chip.value}</span>
            <span>${chip.label}</span>
          </span>`
          )
          .join('')}
      </div>
    `;
  }

  render() {
    const summaryMarkdown = this.generateSummary();

    return `
      <section class="memora-panel memora-recap-panel memora-doodle-host max-w-xl mx-auto my-4">
        ${doodleLayer(
          [
            [doodle.flowerDoodle, { className: 'memora-doodle memora-doodle-size-md memora-drift', style: 'bottom: -0.9rem; left: -1.25rem; --memora-tilt: -7deg;' }],
            [doodle.squiggle, { className: 'memora-doodle memora-doodle-size-sm', style: 'top: 4.5rem; right: -0.75rem; --memora-tilt: 5deg;' }],
          ],
          'memora-doodles-leaf memora-doodles-faint'
        )}

        <div class="flex items-center gap-3.5 mb-4">
          <div class="memora-panel-mark"><i data-lucide="book-heart" class="w-6 h-6"></i>
          </div>
          <div>
            <h4 class="font-serif-heading font-bold text-2xl text-heading">A note from the album</h4>
            <p class="text-xs text-[var(--accent-leaf)]">Timeline & shared details</p>
          </div>
        </div>

        ${this.renderStatChips()}

        <div class="memora-recap-copy">
          ${summaryMarkdown.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
        </div>
      </section>
    `;
  }
}
