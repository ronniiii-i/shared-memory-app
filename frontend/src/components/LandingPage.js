import { UIComponent } from '../core/UIComponent.js';

export class LandingPage extends UIComponent {
  constructor(props) {
    super(props);
    this.demoCoords = [
      { x: 30, y: 30, rot: -5, title: 'Beach Trip Sunset 🌅', user: 'alice' },
      { x: 250, y: 70, rot: 7, title: 'Birthday Dinner 🎂', user: 'bob' },
      { x: 110, y: 210, rot: -3, title: 'Campfire Jam 🏕️', user: 'carol' },
    ];
  }

  onMount() {
    this.delegate('click', '.btn-landing-signin', () => {
      document.dispatchEvent(new CustomEvent('open-clerk-auth'));
    });

    // Make demo polaroids draggable on landing page
    const cards = this.$$('.landing-demo-card');
    cards.forEach((card, index) => {
      let isDragging = false;
      let startX = 0, startY = 0;
      const initialPosition = this.getDemoPosition(index);
      let currX = initialPosition.x;
      let currY = initialPosition.y;

      card.addEventListener('pointerdown', (e) => {
        isDragging = true;
        startX = e.clientX - currX;
        startY = e.clientY - currY;
        card.style.zIndex = '50';
        card.setPointerCapture(e.pointerId);

        const onMove = (mv) => {
          if (!isDragging) return;
          currX = mv.clientX - startX;
          currY = mv.clientY - startY;
          card.style.transform = `translate3d(${currX}px, ${currY}px, 0px) rotate(${this.demoCoords[index].rot}deg)`;
        };

        const onUp = (up) => {
          isDragging = false;
          card.style.zIndex = '10';
          card.releasePointerCapture(up.pointerId);
          card.removeEventListener('pointermove', onMove);
          card.removeEventListener('pointerup', onUp);
        };

        card.addEventListener('pointermove', onMove);
        card.addEventListener('pointerup', onUp);
      });
    });
  }

  getDemoPosition(index) {
    if (window.innerWidth <= 640) {
      return [{ x: 8, y: 18 }, { x: 112, y: 70 }, { x: 52, y: 155 }][index];
    }
    return this.demoCoords[index];
  }

  getDemoStyle(index) {
    const position = this.getDemoPosition(index);
    const width = window.innerWidth <= 640 ? 142 : 195;
    return `transform: translate3d(${position.x}px, ${position.y}px, 0px) rotate(${this.demoCoords[index].rot}deg); width: ${width}px;`;
  }

  render() {
    return `
      <main class="relative overflow-hidden min-h-screen">
        <!-- Warm Soft Background Glowing Aura Orbs -->
        <div class="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-amber-600/15 rounded-full blur-[140px] pointer-events-none"></div>
        <div class="absolute top-1/3 right-10 w-[400px] h-[400px] bg-orange-700/10 rounded-full blur-[120px] pointer-events-none"></div>

        <!-- Hero Section -->
        <section aria-label="Hero" class="max-w-7xl mx-auto px-6 pt-12 pb-16 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
          <div class="lg:col-span-7 space-y-6">
            <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/15 border border-amber-600/25 text-main text-xs font-semibold tracking-wide backdrop-blur-md">
              <i data-lucide="sparkles" class="w-4 h-4 text-amber-600 dark:text-amber-400"></i>
              <span>Shared Photo Scrapbooks for Friends</span>
            </div>

            <h1 class="text-4xl sm:text-6xl font-black font-heading tracking-tight text-heading leading-[1.15]">
              Your Friends. Your Trip. <br />
              <span class="bg-gradient-to-r from-amber-700 via-orange-600 to-amber-500 dark:from-amber-400 dark:via-orange-300 dark:to-amber-200 -webkit-background-clip-text text-transparent">
                One Shared Scrapbook Table.
              </span>
            </h1>

            <p class="text-base sm:text-lg text-muted max-w-xl font-sans leading-relaxed">
              Whether it’s a weekend getaway, a birthday party, or a festival squad — gather everyone’s photos in an interactive canvas. Move polaroids around like a real paper album, leave voice note reactions, and relive the moment together.
            </p>

            <div class="flex flex-wrap items-center gap-4 pt-2">
              <button class="btn-landing-signin px-8 py-4 bg-gradient-to-r from-amber-700 via-orange-700 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-sm rounded-2xl shadow-xl hover:shadow-amber-700/25 transition-all hover:scale-[1.03] active:scale-95 cursor-pointer flex items-center gap-2.5" aria-label="Create your album">
                <i data-lucide="camera" class="w-5 h-5"></i>
                <span>Create Your Scrapbook</span>
              </button>
            </div>

            <!-- Warm Highlights -->
            <div class="pt-8 border-t border-amber-900/20 dark:border-amber-500/20 grid grid-cols-3 gap-6 text-muted text-xs">
              <div class="flex items-center gap-2">
                <i data-lucide="check-circle" class="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0"></i>
                <span>Easy QR Invites</span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="check-circle" class="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0"></i>
                <span>Voice Notes</span>
              </div>
              <div class="flex items-center gap-2">
                <i data-lucide="check-circle" class="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0"></i>
                <span>Real-Time Reactions</span>
              </div>
            </div>
          </div>

          <!-- Interactive Hero Demo Canvas -->
          <div class="lg:col-span-5 relative">
            <div class="glass-panel p-5 rounded-3xl border border-amber-900/30 dark:border-amber-500/20 shadow-2xl relative h-[430px] overflow-hidden">
              <div class="flex items-center justify-between px-3 py-2 border-b border-amber-900/20 dark:border-amber-500/20 mb-2">
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 rounded-full bg-amber-600"></div>
                  <div class="w-3 h-3 rounded-full bg-orange-500"></div>
                  <div class="w-3 h-3 rounded-full bg-amber-400"></div>
                  <span class="text-xs font-semibold text-muted ml-2">Try Dragging The Photos!</span>
                </div>
              </div>

              <!-- Interactive Cards -->
              <div class="relative w-full h-full">
                <div class="landing-demo-card absolute polaroid-card shadow-xl cursor-grab active:cursor-grabbing transition-shadow" style="${this.getDemoStyle(0)}">
                  <img src="https://picsum.photos/seed/vv1/400/300" alt="Beach" class="h-32 object-cover rounded" />
                  <div class="polaroid-caption text-xs font-semibold text-slate-800 mt-2 text-center">
                    ${this.demoCoords[0].title}
                  </div>
                </div>

                <div class="landing-demo-card absolute polaroid-card shadow-xl cursor-grab active:cursor-grabbing transition-shadow" style="${this.getDemoStyle(1)}">
                  <img src="https://picsum.photos/seed/vv2/400/300" alt="Dinner" class="h-32 object-cover rounded" />
                  <div class="polaroid-caption text-xs font-semibold text-slate-800 mt-2 text-center">
                    ${this.demoCoords[1].title}
                  </div>
                </div>

                <div class="landing-demo-card absolute polaroid-card shadow-xl cursor-grab active:cursor-grabbing transition-shadow" style="${this.getDemoStyle(2)}">
                  <img src="https://picsum.photos/seed/vv3/400/300" alt="Camping" class="h-32 object-cover rounded" />
                  <div class="polaroid-caption text-xs font-semibold text-slate-800 mt-2 text-center">
                    ${this.demoCoords[2].title}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Everyday Features Section -->
        <section aria-label="How it works" class="max-w-7xl mx-auto px-6 py-16 border-t border-amber-900/20 dark:border-amber-500/20">
          <div class="text-center max-w-2xl mx-auto mb-14 space-y-2">
            <h2 class="text-3xl font-extrabold text-heading font-heading">How You & Your Friends Vibe</h2>
            <p class="text-sm text-muted">A shared album experience built for real moments.</p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <!-- Feature 1 -->
            <div class="glass-panel p-8 rounded-3xl border border-amber-900/20 dark:border-amber-500/20">
              <div class="w-12 h-12 rounded-2xl bg-amber-600/15 border border-amber-600/30 flex items-center justify-center text-amber-700 dark:text-amber-400 mb-5">
                <i data-lucide="layout" class="w-6 h-6"></i>
              </div>
              <h3 class="font-heading font-bold text-lg text-heading mb-2">Interactive Tabletop Canvas</h3>
              <p class="text-xs text-muted leading-relaxed">
                Spread your photos out like a real paper album. Drag photos into place, rotate them, and position them anywhere on the shared canvas.
              </p>
            </div>

            <!-- Feature 2 -->
            <div class="glass-panel p-8 rounded-3xl border border-amber-900/20 dark:border-amber-500/20">
              <div class="w-12 h-12 rounded-2xl bg-orange-600/15 border border-orange-600/30 flex items-center justify-center text-orange-700 dark:text-orange-400 mb-5">
                <i data-lucide="mic" class="w-6 h-6"></i>
              </div>
              <h3 class="font-heading font-bold text-lg text-heading mb-2">10-Second Voice Notes</h3>
              <p class="text-xs text-muted leading-relaxed">
                Record quick voice clips right on top of a photo — capture the laughs, inside jokes, and background sounds of your favorite moments.
              </p>
            </div>

            <!-- Feature 3 -->
            <div class="glass-panel p-8 rounded-3xl border border-amber-900/20 dark:border-amber-500/20">
              <div class="w-12 h-12 rounded-2xl bg-amber-600/15 border border-amber-600/30 flex items-center justify-center text-amber-700 dark:text-amber-400 mb-5">
                <i data-lucide="flame" class="w-6 h-6"></i>
              </div>
              <h3 class="font-heading font-bold text-lg text-heading mb-2">Live Vibe Reactions</h3>
              <p class="text-xs text-muted leading-relaxed">
                React to a friend's photo with a 🔥 or ❤️ and watch live animated emojis float across everyone’s screens in real-time.
              </p>
            </div>

            <!-- Feature 4 -->
            <div class="glass-panel p-8 rounded-3xl border border-amber-900/20 dark:border-amber-500/20">
              <div class="w-12 h-12 rounded-2xl bg-amber-700/15 border border-amber-700/30 flex items-center justify-center text-amber-800 dark:text-amber-300 mb-5">
                <i data-lucide="qr-code" class="w-6 h-6"></i>
              </div>
              <h3 class="font-heading font-bold text-lg text-heading mb-2">Instant QR & Link Sharing</h3>
              <p class="text-xs text-muted leading-relaxed">
                Share your album with a quick QR code or short-link. Add an optional passcode if you want to keep the album exclusive to your group.
              </p>
            </div>

            <!-- Feature 5 -->
            <div class="glass-panel p-8 rounded-3xl border border-amber-900/20 dark:border-amber-500/20">
              <div class="w-12 h-12 rounded-2xl bg-orange-700/15 border border-orange-700/30 flex items-center justify-center text-orange-800 dark:text-orange-300 mb-5">
                <i data-lucide="sparkles" class="w-6 h-6"></i>
              </div>
              <h3 class="font-heading font-bold text-lg text-heading mb-2">Automated Memory Recap</h3>
              <p class="text-xs text-muted leading-relaxed">
                An auto-generated timeline summary highlights your album's peak moments, busiest photo drops, and top reactions.
              </p>
            </div>

            <!-- Feature 6 -->
            <div class="glass-panel p-8 rounded-3xl border border-amber-900/20 dark:border-amber-500/20">
              <div class="w-12 h-12 rounded-2xl bg-amber-600/15 border border-amber-600/30 flex items-center justify-center text-amber-700 dark:text-amber-400 mb-5">
                <i data-lucide="shield" class="w-6 h-6"></i>
              </div>
              <h3 class="font-heading font-bold text-lg text-heading mb-2">Simple Album Controls</h3>
              <p class="text-xs text-muted leading-relaxed">
                Album creators get a clean dashboard to manage guests, set passcodes, or curate photos whenever needed.
              </p>
            </div>
          </div>
        </section>

        <!-- Footer -->
        <footer class="border-t border-amber-900/20 dark:border-amber-500/20 py-8 px-6 text-center text-xs text-muted">
          <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div class="flex items-center gap-2">
              <i data-lucide="camera" class="w-4 h-4 text-amber-600 dark:text-amber-400"></i>
              <span class="font-heading font-bold text-heading">VibeVault</span>
              <span>— Shared Photo Scrapbooks</span>
            </div>
            <div>Built for friends, events, and memories</div>
          </div>
        </footer>
      </main>
    `;
  }
}
