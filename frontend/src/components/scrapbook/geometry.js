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

import { Circle, Ellipse, Group, Path, Polygon, Rect, Triangle } from 'fabric';

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

/**
 * Alternating outer/inner radii, for stars and sunbursts - and, when the two
 * radii are equal, a regular polygon.
 *
 * The equal case has to collapse the inner ring. Emitting the full
 * `spikes * 2` sequence with both radii the same puts every vertex on the same
 * circle, which is not a hexagon with 6 points but a 12-sided polygon - so the
 * shape labelled "Hexagon" came out with twelve sides.
 */
export function radialPolygon(spikes, outerRadius, innerRadius, rotation = -Math.PI / 2) {
  const solid = Math.abs(outerRadius - innerRadius) < 0.01;
  const count = solid ? spikes : spikes * 2;
  // A star's vertices advance by half a spike angle, so 2n of them fill a full
  // turn. A regular n-gon advances by a whole spike angle, so n of them do.
  // Using the star step for both left a "hexagon" with six points sitting on the
  // circle but spanning only 150 degrees - the right points in the wrong arc,
  // which reads as a wedge rather than a shape.
  const step = (solid ? Math.PI * 2 : Math.PI) / spikes;
  const points = [];
  for (let index = 0; index < count; index += 1) {
    const radius = solid || index % 2 === 0 ? outerRadius : innerRadius;
    const angle = rotation + index * step;
    points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return points;
}

/** Clamp a requested side count into the range the polygon shape offers. */
export function clampSides(value, range = { min: 3, max: 12 }) {
  const count = Math.round(Number(value));
  if (!Number.isFinite(count)) return range.value || range.min;
  return Math.min(range.max, Math.max(range.min, count));
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
// Three things every entry has to get right:
//
// - A `Rect` is the one shape with no intrinsic size, so it carries an explicit
//   width and height. `new Rect({ rx })` is 0x0 and renders as nothing.
// - A `Path` used as an outline (the line) has no fill, so it is marked
//   `stroke: true` and the colour controls paint its stroke rather than a fill.
// - `build` takes an options object, because the polygon needs the author's
//   chosen side count when the page is rebuilt.
//
// There is deliberately no `icon` field. The picker draws each shape from this
// same geometry via `shapeSvg`, because a hand-picked icon name drifts from the
// shape it stands for - which is how "blob" ended up wearing a spline and
// "burst" a sun.

/** Default fill for solid shapes, and ink for outline-only ones. */
export const SHAPE_FILL = '#e7b66b';
export const SHAPE_INK = '#2f241e';

/** The side-count range the polygon shape offers. */
const SIDES_RANGE = { min: 3, max: 12, step: 1, value: 6 };

/**
 * A ribbon banner: swallowtail notches cut into both short ends.
 * The previous path was a rectangle with a wavy bottom, which read as a flag.
 */
const BANNER_PATH = [
  'M -130 -50', 'L 130 -50', 'L 130 50', 'L 100 50', 'L 130 0', 'L 100 -50',
  'L -100 -50', 'L -130 0', 'L -100 50', 'L -130 50', 'Z',
].join(' ');

export const SHAPES = [
  { id: 'rect', label: 'Rectangle', build: () => new Rect({ width: 240, height: 165, rx: 2, ry: 2 }) },
  { id: 'rounded', label: 'Rounded', build: () => new Rect({ width: 240, height: 165, rx: 26, ry: 26 }) },
  { id: 'circle', label: 'Circle', build: () => new Circle({ radius: 105 }) },
  { id: 'ellipse', label: 'Ellipse', build: () => new Ellipse({ rx: 130, ry: 90 }) },
  { id: 'triangle', label: 'Triangle', build: () => new Triangle({ width: 240, height: 210 }) },
  {
    // The side count is the author's call, not the catalogue's. `sides` describes
    // the control the panel renders; `build` reads the saved value back, so a
    // page reopened at 9 sides still has 9 sides.
    id: 'polygon',
    label: 'Polygon',
    sides: SIDES_RANGE,
    build: ({ sides } = {}) => new Polygon(
      radialPolygon(clampSides(sides, SIDES_RANGE), 125, 125, -Math.PI / 2),
      { originX: 'center', originY: 'center' },
    ),
  },
  { id: 'star', label: 'Star', build: () => new Polygon(radialPolygon(5, 125, 52), { originX: 'center', originY: 'center' }) },
  { id: 'burst', label: 'Burst', build: () => new Polygon(radialPolygon(14, 128, 78), { originX: 'center', originY: 'center' }) },
  { id: 'hexagon', label: 'Hexagon', build: () => new Polygon(radialPolygon(6, 125, 125, 0), { originX: 'center', originY: 'center' }) },
  { id: 'heart', label: 'Heart', build: () => new Path('M 0 60 C -50 20, -80 -6, -80 -34 C -80 -58, -60 -70, -42 -70 C -26 -70, -12 -60, 0 -44 C 12 -60, 26 -70, 42 -70 C 60 -70, 80 -58, 80 -34 C 80 -6, 50 20, 0 60 Z', { originX: 'center', originY: 'center' }) },
  { id: 'blob', label: 'Blob', build: () => new Polygon(scallopPolygon(7, 128, 96, 0.4), { originX: 'center', originY: 'center' }) },
  { id: 'bubble', label: 'Speech', build: () => new Path('M -110 -70 L 110 -70 C 124 -70, 132 -60, 132 -46 L 132 34 C 132 48, 124 58, 110 58 L 10 58 L -40 96 L -32 58 L -110 58 C -124 58, -132 48, -132 34 L -132 -46 C -132 -60, -124 -70, -110 -70 Z', { originX: 'center', originY: 'center' }) },
  {
    // A path rather than a fabric Line: a Line has no fill, so every colour
    // control was a no-op and the shape was invisible until a border was added
    // by hand. As a stroked Path it is coloured, thickens and borders normally.
    id: 'line', label: 'Line', stroke: true,
    build: () => new Path('M -120 0 L 120 0', { fill: null, stroke: SHAPE_INK, strokeWidth: 10, strokeLineCap: 'round', originX: 'center', originY: 'center' }),
  },
  { id: 'arrow', label: 'Arrow', build: () => new Path('M -120 -22 L 40 -22 L 40 -70 L 124 0 L 40 70 L 40 22 L -120 22 Z', { originX: 'center', originY: 'center' }) },
  { id: 'banner', label: 'Banner', build: () => new Path(BANNER_PATH, { originX: 'center', originY: 'center' }) },
];

export function shapeDefinition(id) {
  return SHAPES.find((item) => item.id === id) || SHAPES[0];
}

/**
 * The shape's own geometry as inline SVG, for the Insert picker.
 *
 * Rendered from the object itself rather than from a hand-written path, so the
 * button cannot show something the canvas will not produce: the picker and the
 * shape are literally the same code. The inner markup comes from fabric's own
 * `toSVG`; the outer viewBox is measured, because this build of fabric throws
 * when passed its `viewBox` option.
 */
export function shapeSvg(definition, options = {}) {
  const object = definition.build(options);
  if (!object) return '';
  const bounds = object.getBoundingRect();
  const pad = 2;
  const viewBox = [
    round(bounds.left - pad),
    round(bounds.top - pad),
    round(Math.max(bounds.width, 1) + pad * 2),
    round(Math.max(bounds.height, 1) + pad * 2),
  ].join(' ');
  return `<svg class="scrapbook-shape-preview" viewBox="${viewBox}" aria-hidden="true" focusable="false">${object.toSVG()}</svg>`;
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
 * array to install; `id` is what gets written to the saved element, so it has to
 * stay a plain string the backend can round-trip.
 *
 * Two lessons are baked into this list, both of them from it being wrong before:
 *
 * - Nothing here leans on `Sepia` for a tint. Sepia is a full colour matrix, so
 *   `Sepia(0.2)` and `Sepia(0.75)` are both just... brown. Tints use
 *   `BlendColor` with a named hue instead, which is what actually separates
 *   warm from cool from mint.
 * - Every entry has to use a filter that exists. There is no `Posterize` in
 *   fabric, so the old "Poster" entry threw `f.Posterize is not a constructor`
 *   and applied nothing at all.
 *
 * Only filters verified to exist in this build are used: BlackWhite, BlendColor,
 * Blur, Brightness, Brownie, ColorMatrix, Contrast, Gamma, Grayscale,
 * HueRotation, Invert, Kodachrome, Noise, Pixelate, Polaroid, Saturation, Sepia,
 * Technicolor, Vibrance, Vintage.
 */
export const PHOTO_FILTERS = [
  { id: 'none', label: 'Original', build: () => [] },

  // Monochrome
  { id: 'mono', label: 'Mono', build: (f) => [new f.Grayscale()] },
  { id: 'noir', label: 'Noir', build: (f) => [new f.Grayscale(), new f.Contrast(1.5), new f.Brightness(-0.06)] },
  { id: 'ink', label: 'Ink', build: (f) => [new f.Grayscale(), new f.Contrast(2.1), new f.Brightness(0.02)] },

  // Tinted, by hue rather than by sepia
  { id: 'warm', label: 'Warm', build: (f) => [new f.BlendColor({ color: '#ff9a3c', mode: 'multiply', alpha: 0.28 }), new f.Vibrance(0.25)] },
  { id: 'cool', label: 'Cool', build: (f) => [new f.BlendColor({ color: '#4a86d6', mode: 'multiply', alpha: 0.3 }), new f.Saturation(0.92)] },
  { id: 'mint', label: 'Mint', build: (f) => [new f.BlendColor({ color: '#7fe3c4', mode: 'screen', alpha: 0.22 }), new f.Contrast(1.06)] },
  { id: 'honey', label: 'Honey', build: (f) => [new f.BlendColor({ color: '#ffc457', mode: 'multiply', alpha: 0.26 }), new f.Saturation(1.25)] },
  { id: 'rust', label: 'Rust', build: (f) => [new f.BlendColor({ color: '#b4481f', mode: 'multiply', alpha: 0.34 }), new f.Contrast(1.18)] },
  { id: 'rose', label: 'Rose', build: (f) => [new f.BlendColor({ color: '#ff8fb0', mode: 'screen', alpha: 0.2 }), new f.Gamma({ gamma: [1.06, 0.98, 1.02] })] },
  { id: 'sepia', label: 'Sepia', build: (f) => [new f.Sepia()] },

  // Tonal
  { id: 'faded', label: 'Faded', build: (f) => [new f.Gamma({ gamma: [1.15, 1.15, 1.15] }), new f.Contrast(0.72), new f.Saturation(0.72)] },
  { id: 'punch', label: 'Punch', build: (f) => [new f.Contrast(1.34), new f.Vibrance(0.55)] },
  { id: 'soft', label: 'Soft', build: (f) => [new f.Blur(1.4), new f.Brightness(0.09), new f.Saturation(0.88)] },
  { id: 'dream', label: 'Dream', build: (f) => [new f.Blur(2.6), new f.Brightness(0.13), new f.Vibrance(0.4)] },
  { id: 'grain', label: 'Grain', build: (f) => [new f.Noise({ noise: 0.22 }), new f.Contrast(1.08), new f.Saturation(0.85)] },

  // Film stock
  { id: 'vintage', label: 'Vintage', build: (f) => [new f.Vintage()] },
  { id: 'brownie', label: 'Brownie', build: (f) => [new f.Brownie()] },
  { id: 'kodachrome', label: 'Kodachrome', build: (f) => [new f.Kodachrome()] },
  { id: 'technicolor', label: 'Technicolor', build: (f) => [new f.Technicolor()] },
  { id: 'polaroid', label: 'Polaroid', build: (f) => [new f.Polaroid()] },
  { id: 'vhs', label: 'VHS', build: (f) => [new f.Pixelate({ pixels: 4 }), new f.HueRotation(14), new f.Saturation(1.5), new f.Contrast(0.92)] },

  // Graphic
  { id: 'poster', label: 'Poster', build: (f) => [new f.Grayscale(), new f.BlendColor({ color: '#c8354a', mode: 'multiply', alpha: 0.55 }), new f.Contrast(1.3)] },
  { id: 'duotone', label: 'Duo', build: (f) => [new f.Grayscale(), new f.BlendColor({ color: '#2f6f8f', mode: 'multiply', alpha: 0.45 })] },
  { id: 'pixel', label: 'Pixel', build: (f) => [new f.Pixelate({ pixels: 16 })] },
  { id: 'invert', label: 'Invert', build: (f) => [new f.Invert()] },
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
 * Frames cut the picture to a shape, the way a real mount does.
 *
 * The previous frame was a mat behind the photo plus a rule around it, which is
 * a border wearing a different name - and the two are now mutually exclusive,
 * because a stroke on a photo whose edges have been clipped away is either
 * invisible or a lie.
 *
 * Every entry's `build` receives the photo's own box and returns a fabric
 * object to install as the photo's `clipPath`, so the cut fits whatever size
 * the image is. The object is returned in the image's local coordinates, centred
 * on the origin, which is where fabric applies a clipPath.
 */
export const FRAMES = [
  { id: 'none', label: 'None', build: () => null },
  { id: 'circle', label: 'Circle', build: (w, h) => new Circle({ radius: Math.min(w, h) / 2, originX: 'center', originY: 'center' }) },
  { id: 'oval', label: 'Oval', build: (w, h) => new Ellipse({ rx: w / 2, ry: h / 2, originX: 'center', originY: 'center' }) },
  { id: 'rounded', label: 'Soft', build: (w, h) => new Rect({ width: w, height: h, rx: Math.min(w, h) * 0.16, ry: Math.min(w, h) * 0.16, originX: 'center', originY: 'center' }) },
  { id: 'arch', label: 'Arch', build: (w, h) => new Path(archPath(w, h), { originX: 'center', originY: 'center' }) },
  { id: 'heart', label: 'Heart', build: (w, h) => new Path(heartPath(w, h), { originX: 'center', originY: 'center' }) },
  { id: 'blob', label: 'Blob', build: (w, h) => new Polygon(blobPoints(w, h), { originX: 'center', originY: 'center' }) },
  { id: 'star', label: 'Star', build: (w, h) => new Polygon(starPoints(w, h), { originX: 'center', originY: 'center' }) },
  { id: 'hexagon', label: 'Hexagon', build: (w, h) => new Polygon(hexagonPoints(w, h), { originX: 'center', originY: 'center' }) },
  { id: 'diamond', label: 'Diamond', build: (w, h) => new Polygon(diamondPoints(w, h), { originX: 'center', originY: 'center' }) },
  { id: 'teardrop', label: 'Drop', build: (w, h) => new Path(dropPath(w, h), { originX: 'center', originY: 'center' }) },
  { id: 'ticket', label: 'Ticket', build: (w, h) => new Path(ticketPath(w, h), { originX: 'center', originY: 'center' }) },
  { id: 'cloud', label: 'Cloud', build: (w, h) => new Polygon(cloudPoints(w, h), { originX: 'center', originY: 'center' }) },
  { id: 'leaf', label: 'Leaf', build: (w, h) => new Path(leafPath(w, h), { originX: 'center', originY: 'center' }) },
];

/**
 * The frame outlines, fitted to the photo box. Authoring each against the box
 * rather than against fixed pixels is what stops every frame from having to be
 * hand-tuned per photo size.
 */

function archPath(w, h) {
  // A round-headed doorway: straight sides, semicircular top.
  //
  // The dome's radius is capped at half the width *and* the height, and the
  // chord sits that far down from the top edge, so the finished arch is exactly
  // the photo's box. Sizing the radius off the width alone made the dome stand
  // taller than the photo, and a clip that is taller than what it clips just
  // shows the photo's own straight top edge - the arch silently did nothing.
  const r = Math.min(w / 2, h);
  const springLine = -h / 2 + r;
  return `M ${-w / 2} ${h / 2} L ${-w / 2} ${springLine} A ${r} ${r} 0 0 1 ${w / 2} ${springLine} L ${w / 2} ${h / 2} Z`;
}

function heartPath(w, h) {
  // The same curve as the heart sticker, scaled into the box.
  const sx = w / 160;
  const sy = h / 130;
  return `M 0 ${60 * sy} C ${-50 * sx} ${20 * sy}, ${-80 * sx} ${-6 * sy}, ${-80 * sx} ${-34 * sy} `
    + `C ${-80 * sx} ${-58 * sy}, ${-60 * sx} ${-70 * sy}, ${-42 * sx} ${-70 * sy} `
    + `C ${-26 * sx} ${-70 * sy}, ${-12 * sx} ${-60 * sy}, 0 ${-44 * sy} `
    + `C ${12 * sx} ${-60 * sy}, ${26 * sx} ${-70 * sy}, ${42 * sx} ${-70 * sy} `
    + `C ${60 * sx} ${-70 * sy}, ${80 * sx} ${-58 * sy}, ${80 * sx} ${-34 * sy} `
    + `C ${80 * sx} ${-6 * sy}, ${50 * sx} ${20 * sy}, 0 ${60 * sy} Z`;
}

function dropPath(w, h) {
  // A teardrop: point at the top, round at the bottom.
  const r = Math.min(w, h) * 0.42;
  return `M 0 ${-h / 2} C ${r * 1.1} ${-h * 0.1}, ${r * 1.05} ${h / 2}, 0 ${h / 2} `
    + `C ${-r * 1.05} ${h / 2}, ${-r * 1.1} ${-h * 0.1}, 0 ${-h / 2} Z`;
}

function ticketPath(w, h) {
  // A stubby rectangle with a semicircular bite out of each short side.
  const notch = Math.min(w, h) * 0.12;
  return `M ${-w / 2} ${-h / 2} L ${w / 2} ${-h / 2} L ${w / 2} ${-notch} `
    + `A ${notch} ${notch} 0 0 0 ${w / 2} ${notch} L ${w / 2} ${h / 2} `
    + `L ${-w / 2} ${h / 2} L ${-w / 2} ${notch} `
    + `A ${notch} ${notch} 0 0 0 ${-w / 2} ${-notch} L ${-w / 2} ${-h / 2} Z`;
}

function leafPath(w, h) {
  // Two mirrored arcs meeting at the top and bottom points.
  return `M 0 ${-h / 2} C ${w / 2} ${-h * 0.22}, ${w / 2} ${h * 0.22}, 0 ${h / 2} `
    + `C ${-w / 2} ${h * 0.22}, ${-w / 2} ${-h * 0.22}, 0 ${-h / 2} Z`;
}

function diamondPoints(w, h) {
  return [
    { x: 0, y: -h / 2 }, { x: w / 2, y: 0 }, { x: 0, y: h / 2 }, { x: -w / 2, y: 0 },
  ];
}

function starPoints(w, h) {
  const outer = Math.min(w, h) / 2;
  const inner = outer * 0.42;
  return radialPolygon(5, outer, inner).map((point) => ({ x: point.x, y: point.y }));
}

function hexagonPoints(w, h) {
  const radius = Math.min(w, h) / 2;
  return radialPolygon(6, radius, radius, 0);
}

function blobPoints(w, h) {
  const radius = Math.min(w, h) / 2;
  return scallopPolygon(7, radius * 0.98, radius * 0.74, 0.4);
}

function cloudPoints(w, h) {
  const radius = Math.min(w, h) / 2;
  return scallopPolygon(5, radius * 0.98, radius * 0.68, -Math.PI / 2);
}

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

// ── colour slots ───────────────────────────────────────────────────────────
//
// A sticker is not two colours. The cherries are red fruit, green stems and a
// green leaf; the cake has icing, sponge, a cherry and a candle; the toadstool
// has a cap, spots and a stalk. The panel used to offer one swatch and an
// "accent", so everything else was frozen at whatever the catalogue said.
//
// Rather than annotate 38 definitions by hand, the slots are *derived* from the
// parts: a part either follows the sticker fill, or names a colour of its own.
// Each distinct named colour becomes a slot, in the order it first appears, and
// each part is permanently bound to its slot index. The mapping is computed
// from the definition's own colours and cached, so it stays stable while the
// user edits the colours themselves - keying it by the current colour would
// renumber the slots on every change.

const slotCache = new WeakMap();

/** slot 0 is the fill, slot 1 (if the sticker has one) the accent, then details. */
function slotsFor(definition) {
  const cached = slotCache.get(definition);
  if (cached) return cached;

  const accent = definition.accent ?? null;
  const parts = definition.parts(accent);
  const order = [null];
  if (accent) order.push(accent);
  const index = parts.map((part) => {
    // A detail draws a stroke, a solid part a fill; either way its colour is
    // the thing to look for.
    const key = part.fill === null ? part.stroke : part.fill;
    if (typeof key !== 'string') return 0;
    const at = order.indexOf(key);
    if (at >= 0) return at;
    order.push(key);
    return order.length - 1;
  });

  const slots = { order, index, count: order.length };
  slotCache.set(definition, slots);
  return slots;
}

const SLOT_LABELS = ['Fill', 'Accent'];

/** The human name of a slot, for the colour rows in the panel. */
function slotLabel(index) {
  if (SLOT_LABELS[index]) return SLOT_LABELS[index];
  return `Detail ${index - 1}`;
}

/**
 * A sticker's editable colours, as `{ count, colors, labels }`.
 *
 * `colors` may be passed to override; anything left out falls back to the
 * definition's own colour, so a partially-saved sticker still renders.
 */
export function stickerColors(definition, colors) {
  const { order, count } = slotsFor(definition);
  const resolved = [];
  const labels = [];
  for (let index = 0; index < count; index += 1) {
    resolved.push(colors?.[index] || order[index] || definition.fill);
    labels.push(slotLabel(index));
  }
  return { count, colors: resolved, labels };
}

/** The colour a single part should be painted, given the resolved palette. */
function colourFor(part, colors, slot) {
  if (part.fill === null) return colors[slot];
  if (part.fill) return colors[slot];
  return colors[0];
}

/** One shape part as a fabric object. */
export function partToFabric(part, colors, slot, rim) {
  const isDetail = part.fill === null;
  const rimSpec = isDetail ? null : rimFor(part, rim);
  const paint = isDetail
    ? {
      fill: null,
      stroke: colourFor(part, colors, slot),
      strokeWidth: part.strokeWidth || 3,
      strokeLineCap: 'round',
    }
    : {
      fill: colourFor(part, colors, slot),
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
export function partToSvg(part, colors, slot, rim) {
  const isDetail = part.fill === null;
  const rimSpec = isDetail ? null : rimFor(part, rim);
  const attributes = isDetail
    ? `fill="none" stroke="${colourFor(part, colors, slot)}" stroke-width="${part.strokeWidth || 3}"`
    : `fill="${colourFor(part, colors, slot)}"${rimSpec ? ` stroke="${rimSpec.color}" stroke-width="${rimSpec.width}"${rimSpec.dash ? ` stroke-dasharray="${rimSpec.dash.join(' ')}"` : ''}` : ' stroke="none" stroke-width="0"'}`;
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

export function stickerSvg(definition, rim, colors) {
  const parts = definition.parts(definition.accent);
  const { index } = slotsFor(definition);
  const palette = stickerColors(definition, colors).colors;
  return `<svg viewBox="${stickerViewBox(definition)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${parts
    .map((part, at) => partToSvg(part, palette, index[at] ?? 0, rim))
    .join('')}</svg>`;
}

/**
 * Rebuild a sticker from its id.
 *
 * Sticker pages store only the id, its colour slots and the rim choice, so
 * recolouring, resizing or extending the catalogue never has to round-trip a
 * path. `fill`/`accentColor` are still accepted and land in the first two slots,
 * which is what keeps pages saved before the slot model opening.
 */
export function buildSticker(stickerId, { colors, fill, accentColor, scale, rim } = {}) {
  const definition = stickerDefinition(stickerId);
  const { index } = slotsFor(definition);
  const palette = stickerColors(definition, colors || legacyColors(definition, fill, accentColor)).colors;
  const parts = definition.parts(definition.accent)
    .map((part, at) => partToFabric(part, palette, index[at] ?? 0, rim))
    .filter(Boolean);
  const group = new Group(parts, { subTargetCheck: false });
  group.elementType = 'sticker';
  group.stickerId = definition.id;
  group.stickerColors = palette;
  // Kept as flat fields too: they are what the older pages stored, and the
  // layer name and the swatches both still read them.
  group.fill = palette[0];
  group.accentColor = palette[1] ?? null;
  group.stickerRim = rim ?? definition.rim ?? false;
  // Every shape is authored inside a roughly 100-unit box, so one base scale
  // keeps them visually consistent without per-definition tuning.
  const size = (scale || 1) * 1.1;
  group.set({ scaleX: size, scaleY: size, originX: 'center', originY: 'center' });
  return group;
}

/** Fold the two old flat colour fields into a slot array. */
function legacyColors(definition, fill, accentColor) {
  const list = [];
  if (fill) list[0] = fill;
  if (accentColor) list[1] = accentColor;
  return list.length ? list : null;
}
