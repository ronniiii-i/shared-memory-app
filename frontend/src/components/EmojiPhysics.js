/**
 * VibeVault — Live Emoji Physics Reaction Animation
 * Spawns floating emoji DOM elements that float up via Web Animations API along randomized Bezier curves.
 */

export function triggerLiveEmoji(emojiChar) {
  const container = document.getElementById('emoji-layer');
  if (!container) return;

  const emojiNode = document.createElement('div');
  emojiNode.className = 'floating-emoji';
  emojiNode.textContent = emojiChar || '🔥';

  // Randomize starting X coordinate across viewport
  const startX = Math.random() * (window.innerWidth - 80) + 40;
  const startY = window.innerHeight + 40;

  // Set initial position
  emojiNode.style.left = `${startX}px`;
  emojiNode.style.top = `${startY}px`;

  container.appendChild(emojiNode);

  // Generate randomized control points for Bezier trajectory
  const deltaX1 = (Math.random() - 0.5) * 300;
  const deltaX2 = (Math.random() - 0.5) * 400;
  const endY = -120;
  const rotation = (Math.random() - 0.5) * 720;
  const scale = 0.8 + Math.random() * 0.6;

  // Use Web Animations API
  const animation = emojiNode.animate(
    [
      {
        transform: `translate(0px, 0px) scale(${scale}) rotate(0deg)`,
        opacity: 1,
      },
      {
        transform: `translate(${deltaX1}px, ${-window.innerHeight * 0.4}px) scale(${scale * 1.2}) rotate(${rotation * 0.5}deg)`,
        opacity: 0.9,
      },
      {
        transform: `translate(${deltaX2}px, ${endY - startY}px) scale(${scale * 0.6}) rotate(${rotation}deg)`,
        opacity: 0,
      },
    ],
    {
      duration: 2500 + Math.random() * 1000,
      easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      fill: 'forwards',
    }
  );

  animation.onfinish = () => {
    emojiNode.remove();
  };
}
