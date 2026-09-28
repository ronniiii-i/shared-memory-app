/**
 * Scrabbook editor geometry and catalogue.
 *
 * Everything here is authored ONCE as plain shape parts and rendered TWICE: as
 * fabric objects on the canvas and as inline SVG in the picker. One source of
 * truth, so a preview can never drift from what actually gets placed.
 *
 * All part geometry is authored on a 0..100 box with (0,0) at the top-left,
 * because that is what makes a hand-written path readable. The bounding box is
 * then measured from the parts themselves (`bboxOf`) and everything is rebased
 * onto the origin, which is what keeps a sticker visually centred inside its
 * own selection box.
 */

import { Circle, Ellipse, Group, Path, Polygon, Rect, Triangle, Line } from 'fabric';

export const STICKER_RIM_DEFAULT = '#fffdf7';

// ── helpers ────────────────────────────────────────────────────────────────

/** Deterministic PRNG so procedural edges look identical on every reload. */
export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Alternating outer/inner radii, for stars and sunbursts. */
export function radialPolygon(spikes, outerRadius, innerRadius, rotation = -Math.PI / 2) {
  const points = [];
  for (let index = 0; index < spikes * 2; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = rotation + (index * Math.PI) / spikes;
    points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return points;
}

/** Washi tape: straight along its length, torn at both ends. */
export function tornTapePoints(width, height) {
  const random = seededRandom(20260928);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const points = [{ x: -halfWidth, y: -halfHeight }, { x: halfWidth, y: -halfHeight }];
  for (let index = 1; index < 5; index += 1) {
    points.push({ x: halfWidth + (index % 2 ? 3.5 : -3.5) * (0.5 + random()), y: -halfHeight + (height * index) / 5 });
  }
  points.push({ x: halfWidth, y: halfHeight }, { x: -halfWidth, y: halfHeight });
  for (let index = 1; index < 5; index += 1) {
    points.push({ x: -halfWidth + (index % 2 ? 3.5 : -3.5) * (0.5 + random()), y: halfHeight - (height * index) / 5 });
  }
  return points;
}

/** A closed blob of `lobes` rounded bumps - clouds, scalloped centres, splats. */
export function scallopPolygon(lobes, outerRadius, innerRadius, rotation = -Math.PI / 2) {
  const points = [];
  const steps = lobes * 8;
  for (let index = 0; index < steps; index += 1) {
    const t = index / steps;
    const angle = rotation + t * Math.PI * 2;
    // Smooth 0..1 wave, so the bumps read as round rather than spiky.
    const wave = 0.5 + 0.5 * Math.cos(angle * lobes - Math.PI * 0.5);
    const radius = innerRadius + (outerRadius - innerRadius) * Math.pow(wave, 0.7);
    points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return points;
}

// ── stickers ───────────────────────────────────────────────────────────────
//
// A sticker used to be a Textbox holding an emoji: it rendered in whatever
// font the device had, could not be recoloured, ignored its saved size, and
// had no die-cut edge. These are real vectors instead.
//
// A part with `fill: null` is a stroke-only detail (a leaf midrib, a sparkle
// highlight) and never picks up the rim. The rim itself is OFF by default -
// a white outline on every sticker read as a sticker-shop sheet - and is opted
// into per sticker, or globally from the Border panel.

/** One plump rounded petal, authored pointing up from its base at (0,0). */
function petalPath(length, width) {
  const tip = length;
  return `M 0 0 C ${width} ${length * 0.28}, ${width} ${length * 0.78}, 0 ${tip} C ${-width} ${length * 0.78}, ${-width} ${length * 0.28}, 0 0 Z`;
}

export const STICKERS = [
  // ── the classics ──
  {
    id: 'heart', label: 'Heart', fill: '#c85a32',
    parts: () => [{ kind: 'path', rim: 8, d: 'M 50 90 C 18 66, 0 46, 0 29 C 0 13, 13 2, 27 2 C 38 2, 46 9, 50 18 C 54 9, 62 2, 73 2 C 87 2, 100 13, 100 29 C 100 46, 82 66, 50 90 Z' }],
  },
  {
    id: 'star', label: 'Star', fill: '#d69b3d',
    parts: () => [{ kind: 'polygon', rim: 8, points: radialPolygon(5, 50, 21) }],
  },
  {
    id: 'sparkle', label: 'Sparkle', fill: '#e0b64a',
    parts: () => [{ kind: 'path', rim: 6, d: 'M 50 2 C 57 33, 67 43, 98 50 C 67 57, 57 67, 50 98 C 43 67, 33 57, 2 50 C 33 43, 43 33, 50 2 Z' }],
  },
  {
    // Rounded petals and a scalloped centre. The previous version used five
    // plain ellipses, which read as a gear rather than a flower.
    id: 'flower', label: 'Flower', fill: '#e08fa6', accent: '#f2c94c',
    parts: (accent) => {
      const parts = [];
      for (let index = 0; index < 5; index += 1) {
        const angle = (index * 2 * Math.PI) / 5 - Math.PI / 2;
        parts.push({
          kind: 'path', rim: 7, d: petalPath(52, 20),
          rotate: (angle * 180) / Math.PI,
        });
      }
      parts.push({ kind: 'polygon', rim: 7, points: scallopPolygon(7, 21, 17) });
      parts.push({ kind: 'circle', fill: accent, r: 9 });
      return parts;
    },
  },
  {
    id: 'sunburst', label: 'Sunburst', fill: '#e0a23c',
    parts: () => [{ kind: 'polygon', rim: 6, points: radialPolygon(12, 50, 30) }],
  },
  {
    id: 'leaf', label: 'Leaf', fill: '#3f9b69', accent: '#2f6f4a',
    parts: (accent) => [
      { kind: 'path', rim: 8, d: 'M 6 94 C 6 42, 44 6, 94 6 C 94 58, 58 94, 6 94 Z' },
      { kind: 'path', fill: null, strokeWidth: 3, d: 'M 12 88 C 40 66, 62 44, 88 14' },
    ],
  },
  {
    id: 'arrow', label: 'Arrow', fill: '#2f6f8f',
    parts: () => [{ kind: 'path', rim: 7, d: 'M 4 36 L 56 36 L 56 12 L 96 50 L 56 88 L 56 64 L 4 64 Z' }],
  },
  {
    id: 'ribbon', label: 'Ribbon', fill: '#8a5a3b',
    parts: () => [{ kind: 'path', rim: 7, d: 'M 6 28 L 94 28 L 78 50 L 94 72 L 6 72 L 22 50 Z' }],
  },
  {
    id: 'tape', label: 'Tape', fill: '#e2b96a',
    parts: () => [{ kind: 'polygon', rim: 5, points: tornTapePoints(150, 44) }],
  },

  // ── nature ──
  {
    id: 'daisy', label: 'Daisy', fill: '#fbf6ec', accent: '#f2c94c', dark: false,
    parts: (accent) => {
      const parts = [];
      for (let index = 0; index < 8; index += 1) {
        const angle = (index * 2 * Math.PI) / 8 - Math.PI / 2;
        parts.push({ kind: 'path', rim: 5, d: petalPath(46, 11), rotate: (angle * 180) / Math.PI });
      }
      parts.push({ kind: 'circle', fill: accent, r: 17 });
      return parts;
    },
  },
  {
    id: 'cherry', label: 'Cherries', fill: '#c8354a', accent: '#3f7a4a',
    parts: (accent) => [
      { kind: 'path', fill: null, stroke: accent, strokeWidth: 4, d: 'M 34 46 C 40 22, 52 12, 60 6' },
      { kind: 'path', fill: null, stroke: accent, strokeWidth: 4, d: 'M 72 40 C 66 22, 60 12, 60 6' },
      { kind: 'path', fill: null, stroke: accent, strokeWidth: 3, d: 'M 60 6 C 68 2, 78 6, 84 12' },
      { kind: 'circle', rim: 6, r: 20, x: 30, y: 68 },
      { kind: 'circle', rim: 6, r: 20, x: 74, y: 60 },
    ],
  },
  {
    id: 'mushroom', label: 'Toadstool', fill: '#c8503f', accent: '#fbf1e2',
    parts: (accent) => [
      { kind: 'ellipse', rim: 7, rx: 46, ry: 34, x: 50, y: 38 },
      { kind: 'circle', fill: accent, r: 8, x: 32, y: 28 },
      { kind: 'circle', fill: accent, r: 6, x: 64, y: 32 },
      { kind: 'circle', fill: accent, r: 5, x: 50, y: 50 },
      { kind: 'path', rim: 7, d: 'M 36 52 C 36 52, 34 84, 32 90 C 32 94, 68 94, 68 90 C 66 84, 64 52, 64 52 Z' },
    ],
  },
  {
    id: 'cactus', label: 'Cactus', fill: '#4f9a5f', accent: '#e8909f',
    parts: (accent) => [
      { kind: 'path', rim: 7, d: 'M 38 92 C 38 60, 38 30, 50 30 C 62 30, 62 60, 62 92 Z' },
      { kind: 'path', rim: 7, d: 'M 38 62 C 20 62, 12 56, 12 46 C 12 36, 24 36, 24 46 C 24 52, 30 54, 38 54 Z' },
      { kind: 'path', rim: 7, d: 'M 62 70 C 80 70, 88 64, 88 54 C 88 44, 76 44, 76 54 C 76 60, 70 62, 62 62 Z' },
      { kind: 'circle', fill: accent, r: 5, x: 50, y: 22 },
    ],
  },
  {
    id: 'pineapple', label: 'Pineapple', fill: '#e0a23c', accent: '#3f7a4a',
    parts: (accent) => [
      { kind: 'path', rim: 7, d: 'M 34 38 C 22 24, 24 10, 30 4 C 34 14, 40 18, 46 20 C 48 12, 54 8, 58 6 C 58 16, 62 24, 66 30 C 72 22, 78 20, 82 20 C 76 28, 74 36, 74 40 Z' },
      { kind: 'ellipse', rim: 7, rx: 28, ry: 32, x: 52, y: 64 },
      { kind: 'path', fill: null, stroke: accent, strokeWidth: 2.5, d: 'M 40 48 L 64 80 M 64 48 L 40 80 M 30 64 L 74 64' },
    ],
  },
  {
    id: 'butterfly', label: 'Butterfly', fill: '#8a6bb8', accent: '#3f2f5e',
    parts: (accent) => [
      { kind: 'ellipse', rim: 6, rx: 27, ry: 20, x: 30, y: 36, angle: -32 },
      { kind: 'ellipse', rim: 6, rx: 27, ry: 20, x: 30, y: 66, angle: 32 },
      { kind: 'ellipse', rim: 6, rx: 20, ry: 15, x: 71, y: 33, angle: 34 },
      { kind: 'ellipse', rim: 6, rx: 20, ry: 15, x: 71, y: 69, angle: -34 },
      { kind: 'ellipse', fill: accent, rx: 4, ry: 26, x: 50, y: 51 },
      { kind: 'path', fill: null, stroke: accent, strokeWidth: 2.5, d: 'M 48 26 C 44 14, 36 8, 28 6 M 52 26 C 56 14, 64 8, 72 6' },
    ],
  },
  {
    id: 'cloud', label: 'Cloud', fill: '#e8eef4', accent: '#9fb6c9', dark: false,
    parts: (accent) => [
      { kind: 'circle', rim: 6, r: 22, x: 30, y: 56 },
      { kind: 'circle', rim: 6, r: 28, x: 54, y: 48 },
      { kind: 'circle', rim: 6, r: 20, x: 76, y: 58 },
      { kind: 'rect', rim: 6, x: 30, y: 66, w: 46, h: 14, rx: 7, fill: null },
    ],
  },
  {
    id: 'rainbow', label: 'Rainbow', fill: '#c8354a', accent: '#3f7fd4',
    parts: (accent) => [
      { kind: 'path', rim: 7, d: 'M 12 86 A 38 38 0 0 1 88 86 L 74 86 A 24 24 0 0 0 26 86 Z' },
      { kind: 'path', fill: accent, d: 'M 26 86 A 24 24 0 0 1 74 86 L 62 86 A 12 12 0 0 0 38 86 Z' },
    ],
  },
  {
    id: 'sun', label: 'Sun', fill: '#e8b23c', accent: '#c85a32',
    parts: (accent) => [
      { kind: 'circle', rim: 7, r: 24, x: 50, y: 50 },
      // A path, not a circle: this is the arc of a sunglass lens. Labelled
      // `circle` it fell into the circle branch of both renderers, which read
      // `r` - undefined here - so the SVG emitted `r="undefined"` and the canvas
      // built a Circle with no radius.
      { kind: 'path', fill: null, stroke: accent, strokeWidth: 4, strokeLineCap: 'round', d: 'M 44 40 A 8 8 0 0 1 56 40' },
      { kind: 'path', fill: null, stroke: accent, strokeWidth: 3.5, strokeLineCap: 'round', d: 'M 38 54 C 38 60, 44 64, 50 64 C 56 64, 62 60, 62 54' },
    ],
  },
  {
    id: 'moon', label: 'Crescent', fill: '#e8d9a0',
    parts: () => [{ kind: 'path', rim: 7, d: 'M 68 8 A 44 44 0 1 0 68 92 A 34 34 0 1 1 68 8 Z' }],
  },
  {
    id: 'tree', label: 'Tree', fill: '#3f7a4a', accent: '#8a5a3b',
    parts: (accent) => [
      { kind: 'rect', rim: 6, x: 46, y: 72, w: 10, h: 24, rx: 4, fill: accent },
      { kind: 'polygon', rim: 7, points: [{ x: 50, y: 6 }, { x: 86, y: 52 }, { x: 62, y: 52 }, { x: 78, y: 82 }, { x: 22, y: 82 }, { x: 38, y: 52 }, { x: 14, y: 52 }] },
    ],
  },

  // ── food & drink ──
  {
    id: 'donut', label: 'Donut', fill: '#e0a89a', accent: '#f2c94c',
    parts: (accent) => [
      { kind: 'polygon', rim: 7, points: scallopPolygon(9, 50, 44) },
      { kind: 'path', fill: null, stroke: '#fbf1e2', strokeWidth: 6, d: 'M 20 60 C 26 40, 74 40, 80 60 C 74 78, 26 78, 20 60 Z' },
      { kind: 'circle', fill: accent, r: 4, x: 36, y: 44 },
      { kind: 'circle', fill: accent, r: 4, x: 58, y: 38 },
      { kind: 'circle', fill: '#c8354a', r: 4, x: 64, y: 58 },
      { kind: 'circle', fill: '#6b4f8a', r: 4, x: 42, y: 62 },
    ],
  },
  {
    id: 'icecream', label: 'Ice cream', fill: '#f2c1a0', accent: '#8a5a3b',
    parts: (accent) => [
      { kind: 'path', rim: 7, d: 'M 26 54 L 74 54 L 50 96 Z' },
      { kind: 'path', fill: null, stroke: accent, strokeWidth: 2.5, d: 'M 32 64 L 50 90 M 44 58 L 58 82 M 66 62 L 48 84' },
      { kind: 'circle', rim: 6, r: 18, x: 38, y: 36 },
      { kind: 'circle', rim: 6, r: 18, x: 62, y: 36 },
      { kind: 'circle', rim: 6, r: 20, x: 50, y: 22 },
    ],
  },
  {
    id: 'coffee', label: 'Coffee', fill: '#fbf1e2', accent: '#8a5a3b',
    parts: (accent) => [
      { kind: 'path', rim: 7, d: 'M 18 40 L 74 40 L 68 84 C 68 90, 24 90, 24 84 Z' },
      { kind: 'path', fill: null, stroke: accent, strokeWidth: 4, d: 'M 74 48 C 92 46, 92 68, 74 66' },
      { kind: 'path', fill: null, stroke: accent, strokeWidth: 3, strokeLineCap: 'round', d: 'M 38 28 C 34 20, 42 16, 38 8 M 52 28 C 48 20, 56 16, 52 8' },
    ],
  },
  {
    id: 'cake', label: 'Cake', fill: '#f3d9c4', accent: '#c8354a',
    parts: (accent) => [
      { kind: 'rect', rim: 7, x: 18, y: 58, w: 64, h: 32, rx: 6 },
      { kind: 'path', fill: accent, d: 'M 18 58 C 24 50, 30 66, 36 58 C 42 50, 48 66, 54 58 C 60 50, 66 66, 72 58 C 78 50, 82 62, 82 58 L 82 64 L 18 64 Z' },
      { kind: 'rect', rim: 6, x: 26, y: 30, w: 48, h: 30, rx: 6 },
      { kind: 'path', fill: null, stroke: accent, strokeWidth: 3, d: 'M 50 30 L 50 18' },
      { kind: 'circle', fill: '#e8b23c', r: 5, x: 50, y: 14 },
    ],
  },
  {
    id: 'popsicle', label: 'Popsicle', fill: '#e08fa6', accent: '#8a5a3b',
    parts: (accent) => [
      { kind: 'path', rim: 7, d: 'M 30 10 C 30 10, 20 12, 20 26 L 20 66 C 20 80, 80 80, 80 66 L 80 26 C 80 12, 70 10, 70 10 Z' },
      { kind: 'rect', rim: 6, x: 44, y: 74, w: 12, h: 22, rx: 5, fill: accent },
      { kind: 'path', fill: null, stroke: '#fbf1e2', strokeWidth: 3, d: 'M 32 40 L 68 40 M 32 56 L 68 56' },
    ],
  },

  // ── things ──
  {
    id: 'envelope', label: 'Envelope', fill: '#fbf1e2', accent: '#c85a32',
    parts: (accent) => [
      { kind: 'rect', rim: 7, x: 50, y: 52, w: 84, h: 58, rx: 6 },
      { kind: 'path', fill: null, stroke: accent, strokeWidth: 4, d: 'M 8 50 L 50 78 L 92 50' },
    ],
  },
  {
    id: 'camera', label: 'Camera', fill: '#4a4a52', accent: '#e8b23c',
    parts: (accent) => [
      { kind: 'path', rim: 7, d: 'M 14 40 L 34 40 L 40 28 L 60 28 L 66 40 L 86 40 C 90 40, 90 44, 90 48 L 90 82 C 90 86, 88 88, 84 88 L 16 88 C 12 88, 10 86, 10 82 L 10 48 C 10 44, 10 40, 14 40 Z' },
      { kind: 'circle', fill: accent, r: 16, x: 50, y: 64 },
      { kind: 'circle', fill: '#2a2a30', r: 7, x: 50, y: 64 },
      { kind: 'circle', fill: '#e8e0d4', r: 4, x: 24, y: 52 },
    ],
  },
  {
    id: 'balloon', label: 'Balloon', fill: '#c8354a', accent: '#3f7a4a',
    parts: (accent) => [
      { kind: 'ellipse', rim: 7, rx: 30, ry: 36, x: 50, y: 38 },
      { kind: 'path', rim: 6, d: 'M 44 72 L 56 72 L 50 82 Z' },
      { kind: 'path', fill: null, stroke: accent, strokeWidth: 2.5, d: 'M 50 82 C 56 88, 44 90, 50 96' },
      { kind: 'ellipse', fill: '#ffffff', rx: 8, ry: 11, x: 40, y: 26, angle: -24 },
    ],
  },
  {
    id: 'lightning', label: 'Lightning', fill: '#e8b23c',
    parts: () => [{ kind: 'path', rim: 7, d: 'M 58 4 L 22 56 L 46 56 L 38 96 L 78 40 L 54 40 Z' }],
  },
  {
    id: 'music', label: 'Music note', fill: '#4a4a52',
    parts: () => [
      { kind: 'ellipse', rim: 6, rx: 18, ry: 14, x: 28, y: 80, angle: -20 },
      { kind: 'rect', rim: 6, x: 40, y: 40, w: 8, h: 40, rx: 2 },
      { kind: 'path', rim: 6, d: 'M 48 20 C 62 24, 76 30, 78 42 C 70 34, 58 32, 48 34 Z' },
    ],
  },
  {
    id: 'umbrella', label: 'Umbrella', fill: '#c8354a', accent: '#8a5a3b',
    parts: (accent) => [
      { kind: 'path', rim: 7, d: 'M 6 54 C 6 26, 26 8, 50 8 C 74 8, 94 26, 94 54 C 82 46, 70 46, 58 54 C 46 46, 34 46, 22 54 C 16 50, 10 50, 6 54 Z' },
      { kind: 'path', fill: null, stroke: accent, strokeWidth: 4, d: 'M 50 54 L 50 88 C 50 96, 36 96, 36 88' },
    ],
  },
  {
    id: 'book', label: 'Book', fill: '#3f7fd4', accent: '#fbf1e2',
    parts: (accent) => [
      { kind: 'path', rim: 7, d: 'M 50 24 C 38 14, 20 12, 10 14 L 10 82 C 20 80, 38 82, 50 90 Z' },
      { kind: 'path', rim: 7, d: 'M 50 24 C 62 14, 80 12, 90 14 L 90 82 C 80 80, 62 82, 50 90 Z' },
      { kind: 'path', fill: null, stroke: accent, strokeWidth: 2.5, d: 'M 50 24 L 50 90' },
    ],
  },
  {
    id: 'glasses', label: 'Glasses', fill: '#4a4a52',
    parts: () => [
      { kind: 'circle', rim: 6, r: 22, x: 28, y: 52 },
      { kind: 'circle', rim: 6, r: 22, x: 72, y: 52 },
      { kind: 'path', fill: null, strokeWidth: 5, stroke: '#4a4a52', d: 'M 50 50 L 50 50' },
      { kind: 'path', fill: null, strokeWidth: 5, stroke: '#4a4a52', d: 'M 6 46 L 16 50 M 94 46 L 84 50' },
    ],
  },
  {
    id: 'crown', label: 'Crown', fill: '#e8b23c', accent: '#c8354a',
    parts: (accent) => [
      { kind: 'path', rim: 7, d: 'M 12 74 L 8 30 L 30 48 L 50 20 L 70 48 L 92 30 L 88 74 Z' },
      { kind: 'circle', fill: accent, r: 5, x: 8, y: 28 },
      { kind: 'circle', fill: accent, r: 5, x: 50, y: 18 },
      { kind: 'circle', fill: accent, r: 5, x: 92, y: 28 },
    ],
  },
  {
    id: 'splat', label: 'Splat', fill: '#6b4f8a',
    parts: () => [{ kind: 'polygon', rim: 7, points: scallopPolygon(5, 50, 26, -Math.PI / 2 + 0.3) }],
  },
  {
    id: 'wavy', label: 'Wave', fill: '#2f6f8f',
    parts: () => [{ kind: 'path', rim: 7, d: 'M 4 62 C 20 34, 36 34, 50 54 C 64 74, 80 74, 96 46 L 96 88 L 4 88 Z' }],
  },
  {
    id: 'banner', label: 'Banner', fill: '#3f9b69', accent: '#fbf1e2',
    parts: (accent) => [
      { kind: 'path', rim: 7, d: 'M 4 26 L 96 26 L 96 62 C 82 78, 66 66, 50 76 C 34 66, 18 78, 4 62 Z' },
      { kind: 'circle', fill: accent, r: 4, x: 20, y: 44 },
      { kind: 'circle', fill: accent, r: 4, x: 50, y: 48 },
      { kind: 'circle', fill: accent, r: 4, x: 80, y: 44 },
    ],
  },
  {
    id: 'label', label: 'Label', fill: '#e2b96a',
    parts: () => [
      { kind: 'rect', rim: 6, x: 50, y: 50, w: 88, h: 46, rx: 8 },
      { kind: 'circle', fill: null, stroke: '#8a5a3b', strokeWidth: 3, r: 7, x: 20, y: 50 },
    ],
  },
];

/** Sticker look-up, with a safe fallback so a stale id still renders. */
export function stickerDefinition(id) {
  return STICKERS.find((item) => item.id === id) || STICKERS[0];
}

// ── shapes ─────────────────────────────────────────────────────────────────
// A single rounded rectangle is not "shapes". Each entry returns a fresh
// fabric object so a placed shape is never a shared reference.
//
// The rects carry an explicit size because a `Rect` is the one entry whose
// geometry is *not* intrinsic: `new Rect({ rx })` has no width or height and
// fabric renders it at 0x0, so the two most likely shapes of all - a plain
// rectangle and a rounded one - would have been invisible. Every other entry
// derives its own size from a radius, a point list or a path.

export const SHAPES = [
  { id: 'rect', label: 'Rectangle', icon: 'square', build: () => new Rect({ width: 240, height: 165, rx: 2, ry: 2 }) },
  { id: 'rounded', label: 'Rounded', icon: 'square', build: () => new Rect({ width: 240, height: 165, rx: 26, ry: 26 }) },
  { id: 'circle', label: 'Circle', icon: 'circle', build: () => new Circle({ radius: 105 }) },
  { id: 'ellipse', label: 'Ellipse', icon: 'circle', build: () => new Ellipse({ rx: 130, ry: 90 }) },
  { id: 'triangle', label: 'Triangle', icon: 'triangle', build: () => new Triangle({ width: 240, height: 210 }) },
  { id: 'star', label: 'Star', icon: 'star', build: () => new Polygon(radialPolygon(5, 125, 52), { originX: 'center', originY: 'center' }) },
  { id: 'burst', label: 'Burst', icon: 'sun', build: () => new Polygon(radialPolygon(14, 128, 78), { originX: 'center', originY: 'center' }) },
  { id: 'hexagon', label: 'Hexagon', icon: 'hexagon', build: () => new Polygon(radialPolygon(6, 125, 125, 0), { originX: 'center', originY: 'center' }) },
  { id: 'heart', label: 'Heart', icon: 'heart', build: () => new Path('M 0 60 C -50 20, -80 -6, -80 -34 C -80 -58, -60 -70, -42 -70 C -26 -70, -12 -60, 0 -44 C 12 -60, 26 -70, 42 -70 C 60 -70, 80 -58, 80 -34 C 80 -6, 50 20, 0 60 Z', { originX: 'center', originY: 'center' }) },
  { id: 'blob', label: 'Blob', icon: 'spline', build: () => new Polygon(scallopPolygon(7, 128, 96, 0.4), { originX: 'center', originY: 'center' }) },
  { id: 'bubble', label: 'Speech', icon: 'message-square', build: () => new Path('M -110 -70 L 110 -70 C 124 -70, 132 -60, 132 -46 L 132 34 C 132 48, 124 58, 110 58 L 10 58 L -40 96 L -32 58 L -110 58 C -124 58, -132 48, -132 34 L -132 -46 C -132 -60, -124 -70, -110 -70 Z', { originX: 'center', originY: 'center' }) },
  { id: 'line', label: 'Line', icon: 'minus', build: () => new Line([0, 0, 240, 0], { originX: 'center', originY: 'center' }) },
  { id: 'arrow', label: 'Arrow', icon: 'move-right', build: () => new Path('M -120 -22 L 40 -22 L 40 -70 L 124 0 L 40 70 L 40 22 L -120 22 Z', { originX: 'center', originY: 'center' }) },
  { id: 'banner', label: 'Banner', icon: 'flag', build: () => new Path('M -130 -60 L 130 -60 L 130 40 C 96 74, 62 44, 26 66 C -10 44, -44 74, -130 40 Z', { originX: 'center', originY: 'center' }) },
];

export function shapeDefinition(id) {
  return SHAPES.find((item) => item.id === id) || SHAPES[0];
}

// ── palettes ───────────────────────────────────────────────────────────────

/**
 * Swatch groups rather than one long list, so the picker stays short and each
 * row reads as a decision rather than a guess.
 */
export const PALETTES = [
  { label: 'Ink', colors: ['#2f241e', '#5c4a3d', '#8a5a3b', '#b08968'] },
  { label: 'Ember', colors: ['#c85a32', '#e0a23c', '#e8b23c', '#d69b3d'] },
  { label: 'Bloom', colors: ['#c8354a', '#e08fa6', '#d98aa0', '#f3c1cd'] },
  { label: 'Garden', colors: ['#3f9b69', '#7fb069', '#4f9a5f', '#2f6f4a'] },
  { label: 'Sky', colors: ['#2f6f8f', '#3f7fd4', '#7fb6d9', '#9fb6c9'] },
  { label: 'Berry', colors: ['#6b4f8a', '#8a6bb8', '#a86bc0', '#c39ad6'] },
  { label: 'Paper', colors: ['#fbf1e2', '#f6e7cf', '#e8dcc4', '#d9c9ab'] },
  { label: 'Bold', colors: ['#111111', '#ffffff', '#7a2e2e', '#2b3a67'] },
];

export const INK_COLORS = PALETTES.flatMap((palette) => palette.colors);

/** Pen colours, with a couple of pale ones so a light pen is reachable. */
export const PEN_COLORS = [...new Set([...INK_COLORS, '#e05a3c', '#f04e98', '#00a3a3', '#ff7a1a'])];

// ── typography ─────────────────────────────────────────────────────────────
// The canvas could only ever use whatever the app already loaded, which for a
// scrapbook meant no handwriting at all. The woff2 files are fetched by the
// browser on first use, so opening the canvas tab costs nothing extra.

// `sample` is what the menu prints, and it is set to the face's own name. A
// specimen phrase ("the long way home") is prettier but useless in a list of
// twelve: every row reads identically, so you can only tell them apart by
// squinting at letterforms. A name set in its own face is both legible and
// self-demonstrating - you read "Caveat" in Caveat, which is the whole point of
// choosing a face by looking at it rather than by reading a name in Arial.

export const FONTS = [
  { family: 'Newsreader', category: 'Serif', sample: 'Newsreader' },
  { family: 'Playfair Display', category: 'Serif', sample: 'Playfair Display' },
  { family: 'Fraunces', category: 'Serif', sample: 'Fraunces' },
  { family: 'Inter', category: 'Sans', sample: 'Inter' },
  { family: 'Plus Jakarta Sans', category: 'Sans', sample: 'Plus Jakarta Sans' },
  { family: 'Space Grotesk', category: 'Sans', sample: 'Space Grotesk' },
  { family: 'Caveat', category: 'Hand', sample: 'Caveat' },
  { family: 'Patrick Hand', category: 'Hand', sample: 'Patrick Hand' },
  { family: 'Architects Sister', category: 'Hand', sample: 'Architects Sister' },
  { family: 'Permanent Marker', category: 'Hand', sample: 'Permanent Marker' },
  { family: 'Gloria Hallelujah', category: 'Hand', sample: 'Gloria Hallelujah' },
  { family: 'Pacifico', category: 'Script', sample: 'Pacifico' },
];

export const FONT_CATEGORIES = ['Serif', 'Sans', 'Hand', 'Script'];

// ── image treatment ────────────────────────────────────────────────────────

/**
 * Photo looks. `build` receives the fabric `filters` namespace and returns the
 * array to install; `style` is what gets written to the saved element, so it
 * has to stay a plain string the backend can round-trip.
 */
export const PHOTO_FILTERS = [
  { id: 'none', label: 'Original', build: () => [] },
  { id: 'mono', label: 'Mono', build: (f) => [new f.Grayscale()] },
  { id: 'sepia', label: 'Sepia', build: (f) => [new f.Sepia()] },
  { id: 'warm', label: 'Warm', build: (f) => [new f.Sepia(0.35), new f.Brightness(0.04), new f.Saturation(1.15)] },
  { id: 'cool', label: 'Cool', build: (f) => [new f.Sepia(0.2), new f.HueRotation(-18), new f.Saturation(0.9)] },
  { id: 'faded', label: 'Faded', build: (f) => [new f.Sepia(0.2), new f.Contrast(0.78), new f.Brightness(0.12)] },
  { id: 'punch', label: 'Punch', build: (f) => [new f.Contrast(1.32), new f.Saturation(1.45)] },
  { id: 'soft', label: 'Soft', build: (f) => [new f.Blur(0.4), new f.Brightness(0.07)] },
  { id: 'dream', label: 'Dream', build: (f) => [new f.Blur(0.8), new f.Saturation(1.25), new f.Brightness(0.1)] },
  { id: 'noir', label: 'Noir', build: (f) => [new f.Grayscale(), new f.Contrast(1.45)] },
  { id: 'invert', label: 'Invert', build: (f) => [new f.Invert()] },
  { id: 'poster', label: 'Poster', build: (f) => [new f.Posterize(4)] },
  { id: 'pixel', label: 'Pixel', build: (f) => [new f.Pixelate(14)] },
  { id: 'honey', label: 'Honey', build: (f) => [new f.Sepia(0.55), new f.Saturation(1.3), new f.Brightness(0.06)] },
  { id: 'rust', label: 'Rust', build: (f) => [new f.Sepia(0.75), new f.HueRotation(-8), new f.Contrast(1.15)] },
  { id: 'mint', label: 'Mint', build: (f) => [new f.HueRotation(95), new f.Saturation(0.7), new f.Brightness(0.08)] },
  { id: 'vhs', label: 'VHS', build: (f) => [new f.Saturation(1.6), new f.Contrast(0.9), new f.HueRotation(12)] },
];

// ── borders & frames ───────────────────────────────────────────────────────

/** `dash` maps straight onto fabric's strokeDashArray. */
export const BORDER_STYLES = [
  { id: 'solid', label: 'Solid', dash: null },
  { id: 'dashed', label: 'Dashed', dash: [14, 8] },
  { id: 'dotted', label: 'Dotted', dash: [2, 7] },
  { id: 'double', label: 'Double', dash: null, double: true },
  { id: 'dashdot', label: 'Dash-dot', dash: [16, 7, 3, 7] },
];

/**
 * Photo frames are a mat behind the image plus an optional inner rule.
 *
 * `pad` is uniform, because that is all fabric can do: a frame is the object's
 * own `padding`, and `backgroundColor` fills that padded box evenly. A true
 * polaroid wants a deeper foot, which would need a per-side paint, so Polaroid
 * gets a deeper mat on every side instead and reads as a thick mount rather
 * than pretending to be a foot it cannot draw.
 */
export const FRAMES = [
  { id: 'none', label: 'None', mat: null, border: null, pad: 0 },
  { id: 'plain', label: 'Plain', mat: '#fffdf7', border: null, pad: 10 },
  { id: 'outline', label: 'Outline', mat: null, border: { color: '#2f241e', width: 3 }, pad: 6 },
  { id: 'polaroid', label: 'Mount', mat: '#fffdf7', border: null, pad: 22 },
  { id: 'taped', label: 'Taped', mat: '#fffdf7', border: { color: '#dcc9a8', width: 2 }, pad: 14 },
  { id: 'lined', label: 'Lined', mat: '#fffdf7', border: { color: '#d9c9ab', width: 1, style: 'dashed' }, pad: 10 },
  { id: 'double', label: 'Double', mat: '#fffdf7', border: { color: '#2f241e', width: 2, style: 'double' }, pad: 9 },
  { id: 'ink', label: 'Ink', mat: null, border: { color: '#111111', width: 4 }, pad: 4 },
];

export function frameDefinition(id) {
  return FRAMES.find((frame) => frame.id === id) || FRAMES[0];
}

// ── brushes ────────────────────────────────────────────────────────────────

/**
 * Free-draw brushes. fabric's PencilBrush is the baseline; the others
 * post-process the finished path, which keeps a single drawing pipeline and
 * therefore a single serialisation format (`doodle` + `brush`).
 */
export const BRUSHES = [
  { id: 'pen', label: 'Pen', width: 4, opacity: 1, filter: null },
  { id: 'marker', label: 'Marker', width: 16, opacity: 0.45, filter: null },
  { id: 'brush', label: 'Brush', width: 7, opacity: 0.9, filter: (f, path) => new f.Noise({ amount: 0.055 }) },
  { id: 'crayon', label: 'Crayon', width: 9, opacity: 0.75, filter: (f) => new f.Noise({ amount: 0.12 }) },
  { id: 'calligraphy', label: 'Pen nib', width: 3, opacity: 1, filter: null, taper: true },
  { id: 'spray', label: 'Spray', width: 26, opacity: 0.22, filter: null, spray: true },
  { id: 'highlighter', label: 'Highlight', width: 22, opacity: 0.32, filter: null },
  { id: 'eraser', label: 'Eraser', width: 28, opacity: 1, filter: null, eraser: true },
];

export function brushDefinition(id) {
  return BRUSHES.find((brush) => brush.id === id) || BRUSHES[0];
}

// ── page backgrounds ───────────────────────────────────────────────────────

/**
 * A background is a CSS class on the stage plus the label saved with the page,
 * so the palette can grow without a migration.
 */
export const PAGE_BACKGROUNDS = [
  { id: 'paper', label: 'Blank paper', className: 'paper' },
  { id: 'graph', label: 'Graph', className: 'graph' },
  { id: 'lined', label: 'Ruled', className: 'lined' },
  { id: 'dot', label: 'Dotted', className: 'dot' },
  { id: 'grid', label: 'Grid', className: 'grid' },
  { id: 'kraft', label: 'Kraft', className: 'kraft' },
  { id: 'watercolour', label: 'Watercolour', className: 'watercolour' },
  { id: 'confetti', label: 'Confetti', className: 'confetti' },
  { id: 'stripes', label: 'Stripes', className: 'stripes' },
  { id: 'checks', label: 'Gingham', className: 'checks' },
  { id: 'marble', label: 'Marble', className: 'marble' },
  { id: 'film', label: 'Film strip', className: 'film' },
  { id: 'collage', label: 'Warm collage', className: 'collage' },
  { id: 'terrazzo', label: 'Terrazzo', className: 'terrazzo' },
];

export function backgroundDefinition(id) {
  return PAGE_BACKGROUNDS.find((background) => background.id === id) || PAGE_BACKGROUNDS[0];
}

// ── rendering ──────────────────────────────────────────────────────────────

/** Whether a part carries a rim at all, and how wide. */
function rimFor(part, rim) {
  if (part.fill === null) return null;
  if (rim === false) return null;
  if (rim === true || rim === undefined) return { color: STICKER_RIM_DEFAULT, width: part.rim || 6, dash: null };
  if (typeof rim === 'object') return { color: rim.color || STICKER_RIM_DEFAULT, width: rim.width ?? (part.rim || 6), dash: rim.dash || null };
  return null;
}

/** One shape part as a fabric object. */
export function partToFabric(part, fill, accent, rim) {
  const isDetail = part.fill === null;
  const rimSpec = isDetail ? null : rimFor(part, rim);
  const paint = isDetail
    ? {
      fill: null,
      stroke: part.stroke || accent,
      strokeWidth: part.strokeWidth || 3,
      strokeLineCap: 'round',
    }
    : {
      fill: part.fill || fill,
      stroke: rimSpec ? rimSpec.color : null,
      strokeWidth: rimSpec ? rimSpec.width : 0,
      strokeUniform: true,
      strokeDashArray: rimSpec ? rimSpec.dash : null,
      strokeLineJoin: 'round',
      strokeMiterLimit: 2,
      // Paint the rim first so only its outer half shows: the die-cut edge.
      paintFirst: rimSpec ? 'stroke' : 'fill',
    };

  const place = { ...paint, originX: 'center', originY: 'center' };
  if (part.x || part.y || part.angle || part.rotate) {
    place.left = part.x || 0;
    place.top = part.y || 0;
    place.angle = part.angle || part.rotate || 0;
  }
  if (part.kind === 'path') return new Path(part.d, place);
  if (part.kind === 'polygon') return new Polygon(part.points, place);
  if (part.kind === 'circle') return new Circle({ ...place, radius: part.r });
  if (part.kind === 'ellipse') return new Ellipse({ ...place, rx: part.rx, ry: part.ry });
  if (part.kind === 'rect') return new Rect({ ...place, width: part.w, height: part.h, rx: part.rx || 0, ry: part.rx || 0 });
  return null;
}

/** The same part as inline SVG, for the picker. `paint-order` mirrors fabric. */
export function partToSvg(part, fill, accent, rim) {
  const isDetail = part.fill === null;
  const rimSpec = isDetail ? null : rimFor(part, rim);
  const attributes = isDetail
    ? `fill="none" stroke="${part.stroke || accent || fill}" stroke-width="${part.strokeWidth || 3}"`
    : `fill="${part.fill || fill}"${rimSpec ? ` stroke="${rimSpec.color}" stroke-width="${rimSpec.width}"${rimSpec.dash ? ` stroke-dasharray="${rimSpec.dash.join(' ')}"` : ''}` : ' stroke="none" stroke-width="0"'}`;
  const common = `${attributes} stroke-linejoin="round" stroke-linecap="round"${rimSpec ? ' paint-order="stroke"' : ''}`;
  const transform = part.angle || part.rotate ? ` transform="rotate(${part.angle || part.rotate} ${part.x || 0} ${part.y || 0})"` : '';

  if (part.kind === 'path') return `<path d="${part.d}" ${common}${transform} />`;
  if (part.kind === 'polygon') return `<polygon points="${part.points.map((point) => `${round(point.x)},${round(point.y)}`).join(' ')}" ${common} />`;
  if (part.kind === 'circle') return `<circle cx="${round(part.x || 0)}" cy="${round(part.y || 0)}" r="${part.r}" ${common} />`;
  if (part.kind === 'ellipse') return `<ellipse cx="${round(part.x || 0)}" cy="${round(part.y || 0)}" rx="${part.rx}" ry="${part.ry}" ${common}${transform} />`;
  if (part.kind === 'rect') return `<rect x="${round((part.x || 0) - (part.w || 0) / 2)}" y="${round((part.y || 0) - (part.h || 0) / 2)}" width="${part.w}" height="${part.h}" rx="${part.rx || 0}" ${common} />`;
  return '';
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/**
 * The bounding box of a sticker's parts, measured from the geometry itself.
 *
 * The picker used a hardcoded 0..100 viewBox, so any sticker authored with a
 * larger or offset box (tape, the pine tree, the lemon) floated off-centre in
 * its own button. Measuring instead of guessing is what keeps the preview and
 * the selection box snug around the artwork.
 */
export function stickerViewBox(definition) {
  const parts = definition.parts(definition.accent);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x, y) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const part of parts) {
    // Every part counts, including the stroke-only ones. A `fill: null` part is
    // a detail line, not a decoration to be cropped: the cherry's stems, the
    // umbrella's handle, the coffee's steam and the balloon's string all sit
    // *outside* the filled shape, and skipping them cropped the artwork - the
    // umbrella's handle ran 40% past the bottom of its own box.

    // The part's own box, before its rotation is applied.
    let box = null;
    if (part.kind === 'path') {
      // Path bounds need a real measure; a temporary object is the cheap way
      // to get one without hand-parsing bezier control points.
      const probe = new Path(part.d);
      const bounds = probe.getBoundingRect();
      box = { x0: bounds.left, y0: bounds.top, x1: bounds.left + bounds.width, y1: bounds.top + bounds.height };
    } else if (part.kind === 'polygon') {
      box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (const point of part.points) {
        box.x0 = Math.min(box.x0, point.x);
        box.y0 = Math.min(box.y0, point.y);
        box.x1 = Math.max(box.x1, point.x);
        box.y1 = Math.max(box.y1, point.y);
      }
    } else if (part.kind === 'circle') {
      box = { x0: (part.x || 0) - part.r, y0: (part.y || 0) - part.r, x1: (part.x || 0) + part.r, y1: (part.y || 0) + part.r };
    } else if (part.kind === 'ellipse') {
      // A true ellipse's rotated extent is not a simple corner rotation of an
      // axis-aligned box, so an axis-aligned ellipse is over-measured by
      // rotating its largest radius in a circle. That is deliberate: over-
      // measuring costs a little empty space, under-measuring clips the art.
      const r = Math.max(part.rx, part.ry);
      box = { x0: (part.x || 0) - r, y0: (part.y || 0) - r, x1: (part.x || 0) + r, y1: (part.y || 0) + r };
    } else if (part.kind === 'rect') {
      box = {
        x0: (part.x || 0) - (part.w || 0) / 2,
        y0: (part.y || 0) - (part.h || 0) / 2,
        x1: (part.x || 0) + (part.w || 0) / 2,
        y1: (part.y || 0) + (part.h || 0) / 2,
      };
    }
    if (!box) continue;

    // `rotate` is used by the radial parts (the flower's petals), `angle` by
    // the small tilted details. Both are degrees, and both must be applied or
    // the box is measured against the wrong silhouette.
    const rotate = part.rotate || part.angle || 0;
    if (!rotate) {
      grow(box.x0, box.y0);
      grow(box.x1, box.y1);
      continue;
    }

    // Rotating a box needs all four corners, not the two extremes: after a
    // 45-degree turn the widest point is a corner, so growing by the unrotated
    // min and max gives a box far too small. The flower's five petals each
    // measure 30x52 upright, which unions to a narrow 41-wide column, while
    // turned through 72 degrees they actually span 104 - so the measured box
    // was half the real width and the preview clipped the petals off.
    //
    // The turn is about `(part.x, part.y)`, because that is the pivot both
    // renderers use: partToSvg emits `rotate(deg x y)` and partToFabric places
    // the object at (x, y) with that angle. For the radial petals x and y are
    // absent, so the pivot is the origin - not the petal's own middle, which
    // sits 26 units up its length. Using the wrong pivot throws the measured
    // box off by exactly the petal's offset.
    const radians = (rotate * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const pivotX = part.x || 0;
    const pivotY = part.y || 0;
    for (const [px, py] of [[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]]) {
      const dx = px - pivotX;
      const dy = py - pivotY;
      grow(pivotX + dx * cos - dy * sin, pivotY + dx * sin + dy * cos);
    }
  }

  if (!Number.isFinite(minX)) return '-62 -62 124 124';
  // A little air for the rim, then centre the box on the artwork.
  const pad = 4;
  const width = Math.max(maxX - minX, 1) + pad * 2;
  const height = Math.max(maxY - minY, 1) + pad * 2;
  return `${round(minX - pad)} ${round(minY - pad)} ${round(width)} ${round(height)}`;
}

export function stickerSvg(definition, rim) {
  const parts = definition.parts(definition.accent);
  return `<svg viewBox="${stickerViewBox(definition)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${parts
    .map((part) => partToSvg(part, definition.fill, definition.accent, rim))
    .join('')}</svg>`;
}

/**
 * Rebuild a sticker from its id. Sticker pages store only the id, the two
 * swatch colours and the rim choice, so recolouring, resizing or extending the
 * catalogue never has to round-trip a path.
 */
export function buildSticker(stickerId, { fill, accentColor, scale, rim } = {}) {
  const definition = stickerDefinition(stickerId);
  const main = fill || definition.fill;
  const accent = accentColor || definition.accent;
  const parts = definition.parts(accent)
    .map((part) => partToFabric(part, main, accent, rim))
    .filter(Boolean);
  const group = new Group(parts, { subTargetCheck: false });
  group.elementType = 'sticker';
  group.stickerId = definition.id;
  group.fill = main;
  group.accentColor = accent || null;
  group.stickerRim = rim ?? definition.rim ?? false;
  // Every shape is authored inside a roughly 100-unit box, so one base scale
  // keeps them visually consistent without per-definition tuning.
  const size = (scale || 1) * 1.1;
  group.set({ scaleX: size, scaleY: size, originX: 'center', originY: 'center' });
  return group;
}
