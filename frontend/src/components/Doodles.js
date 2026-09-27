/**
 * Memora — hand-drawn vector accents
 *
 * Lightweight inline <svg> doodles authored as raw path data. They sit in the
 * background space of a surface, inherit `color` from their container, and are
 * always `pointer-events: none` (enforced by `.memora-doodles` in main.css).
 *
 * No images, no icon font, no extra requests — just geometry. Stroke styling
 * comes from the `.memora-doodle-stroke*` classes so a doodle picks up the
 * surrounding theme automatically.
 *
 * Usage:
 *   import { doodle } from './Doodles.js';
 *   `<div class="memora-doodles">${doodle.leafSprig({ class: 'memora-doodle memora-doodle-size-md', style: 'top:-2rem;right:4%' })}</div>`
 */

const SVG_ATTRS = 'aria-hidden="true" focusable="false"';

function svg(viewBox, body, { className = '', style = '' } = {}) {
  const cls = `memora-doodle-svg${className ? ` ${className}` : ''}`;
  const sty = style ? ` style="${style}"` : '';
  return `<svg ${SVG_ATTRS} viewBox="${viewBox}" class="${cls}"${sty}>${body}</svg>`;
}

/**
 * Path data is written to look slightly off-kilter on purpose: straight lines
 * are nudged into shallow curves so the set reads as drawn, not generated.
 */
export const doodle = {
  /** Double wavy rule — used under headings and as a section separator. */
  scribbleUnderline: ({ className = '', style = '' } = {}) =>
    svg(
      '0 0 200 24',
      `<path class="memora-doodle-stroke" d="M4 15 C 34 6, 60 20, 92 11 S 152 5, 196 14" />
       <path class="memora-doodle-stroke-thin" d="M10 20 C 44 13, 78 22, 116 15 S 170 12, 194 19" />`,
      { className, style }
    ),

  /** A loose horizontal squiggle. */
  squiggle: ({ className = '', style = '' } = {}) =>
    svg(
      '0 0 80 16',
      `<path class="memora-doodle-stroke" d="M3 11 C 12 3, 21 3, 30 10 C 39 17, 48 17, 57 9 C 64 3, 72 4, 78 9" />`,
      { className, style }
    ),

  /** Four-point sparkle with a tiny companion. */
  starBurst: ({ className = '', style = '' } = {}) =>
    svg(
      '0 0 44 44',
      `<path class="memora-doodle-stroke" d="M20 3 C 21.5 12, 24 17, 37 20 C 24 23, 21.5 28, 20 37 C 18.5 28, 16 23, 3 20 C 16 17, 18.5 12, 20 3 Z" />
       <path class="memora-doodle-stroke-thin" d="M35 4 C 36 7, 37.5 8.5, 40 9 C 37.5 9.5, 36 11, 35 14 C 34 11, 32.5 9.5, 30 9 C 32.5 8.5, 34 7, 35 4 Z" />`,
      { className, style }
    ),

  /** A small branch with three leaves. */
  leafSprig: ({ className = '', style = '' } = {}) =>
    svg(
      '0 0 64 64',
      `<path class="memora-doodle-stroke" d="M9 57 C 21 45, 30 30, 40 9" />
       <path class="memora-doodle-fill" d="M25 43 C 16 43, 11 36, 12 28 C 21 28, 26 34, 25 43 Z" />
       <path class="memora-doodle-stroke-thin" d="M25 43 C 16 43, 11 36, 12 28 C 21 28, 26 34, 25 43 Z" />
       <path class="memora-doodle-fill" d="M32 31 C 40 32, 46 27, 47 19 C 38 18, 32 23, 32 31 Z" />
       <path class="memora-doodle-stroke-thin" d="M32 31 C 40 32, 46 27, 47 19 C 38 18, 32 23, 32 31 Z" />
       <path class="memora-doodle-fill" d="M19 51 C 11 50, 7 44, 9 37 C 17 38, 21 43, 19 51 Z" />
       <path class="memora-doodle-stroke-thin" d="M19 51 C 11 50, 7 44, 9 37 C 17 38, 21 43, 19 51 Z" />`,
      { className, style }
    ),

  /** Hand-drawn heart. */
  heartScribble: ({ className = '', style = '' } = {}) =>
    svg(
      '0 0 48 44',
      `<path class="memora-doodle-stroke" d="M24 39 C 10 30, 4 22, 5 14 C 6 7, 15 5, 20 11 L 24 16 L 28 11 C 33 5, 42 7, 43 14 C 44 22, 38 30, 24 39 Z" />`,
      { className, style }
    ),

  /** A curving directional arrow. */
  arrowCurl: ({ className = '', style = '' } = {}) =>
    svg(
      '0 0 92 52',
      `<path class="memora-doodle-stroke" d="M4 8 C 26 6, 44 14, 58 28 C 68 38, 76 41, 85 34" />
       <path class="memora-doodle-stroke" d="M77 25 C 80 28, 83 31, 86 35" />
       <path class="memora-doodle-stroke" d="M73 41 C 79 41, 84 39, 89 35" />`,
      { className, style }
    ),

  /** A loose sun with uneven rays. */
  sunRays: ({ className = '', style = '' } = {}) =>
    svg(
      '0 0 64 64',
      `<path class="memora-doodle-stroke" d="M32 20 C 40 20, 44 25, 44 32 C 44 39, 40 44, 32 44 C 25 44, 20 39, 20 32 C 20 25, 25 20, 32 20 Z" />
       <path class="memora-doodle-stroke-thin" d="M32 4 L 32 14" />
       <path class="memora-doodle-stroke-thin" d="M32 50 L 32 59" />
       <path class="memora-doodle-stroke-thin" d="M5 32 L 14 32" />
       <path class="memora-doodle-stroke-thin" d="M50 32 L 59 32" />
       <path class="memora-doodle-stroke-thin" d="M12 13 L 19 20" />
       <path class="memora-doodle-stroke-thin" d="M45 44 L 52 51" />
       <path class="memora-doodle-stroke-thin" d="M12 51 L 19 44" />
       <path class="memora-doodle-stroke-thin" d="M45 20 L 52 13" />`,
      { className, style }
    ),

  /** A dashed, hand-drawn loop for circling something. */
  dashedLoop: ({ className = '', style = '' } = {}) =>
    svg(
      '0 0 100 100',
      `<path class="memora-doodle-stroke" stroke-dasharray="7 8" d="M50 9 C 74 7, 91 25, 92 50 C 92 76, 72 92, 48 91 C 24 90, 9 73, 10 50 C 11 26, 26 10, 50 9 Z" />`,
      { className, style }
    ),

  /** A sketched camera. */
  cameraDoodle: ({ className = '', style = '' } = {}) =>
    svg(
      '0 0 82 62',
      `<path class="memora-doodle-stroke" d="M10 19 h11 l6 -8 h21 l6 8 h17 a4 4 0 0 1 4 4 v25 a4 4 0 0 1 -4 4 h-61 a4 4 0 0 1 -4 -4 v-25 a4 4 0 0 1 4 -4 z" />
       <path class="memora-doodle-stroke-thin" d="M34 36 a9 9 0 1 0 0.02 0" />
       <path class="memora-doodle-stroke-thin" d="M66 27 L 69 27" />`,
      { className, style }
    ),

  /** A five-petal flower. */
  flowerDoodle: ({ className = '', style = '' } = {}) =>
    svg(
      '0 0 64 64',
      `<g class="memora-doodle-fill">
         <ellipse cx="32" cy="17" rx="7.5" ry="11" transform="rotate(0 32 32)" />
         <ellipse cx="32" cy="17" rx="7.5" ry="11" transform="rotate(72 32 32)" />
         <ellipse cx="32" cy="17" rx="7.5" ry="11" transform="rotate(144 32 32)" />
         <ellipse cx="32" cy="17" rx="7.5" ry="11" transform="rotate(216 32 32)" />
         <ellipse cx="32" cy="17" rx="7.5" ry="11" transform="rotate(288 32 32)" />
       </g>
       <g class="memora-doodle-stroke-thin">
         <path d="M32 5 C 39 5, 42 11, 39 16" />
         <path d="M57 18 C 58 25, 52 29, 47 27" />
         <path d="M53 52 C 46 56, 40 53, 40 47" />
         <path d="M11 52 C 8 45, 12 40, 18 40" />
         <path d="M7 18 C 10 12, 16 11, 20 15" />
       </g>
       <circle class="memora-doodle-stroke" cx="32" cy="32" r="5" />`,
      { className, style }
    ),

  /** Hand-drawn opening quotation mark. */
  quoteMark: ({ className = '', style = '' } = {}) =>
    svg(
      '0 0 52 34',
      `<path class="memora-doodle-stroke" d="M19 4 C 10 6, 5 12, 5 19 C 5 26, 10 30, 16 30 C 21 30, 25 26, 25 21 C 25 16, 21 12, 16 12 C 16 8, 18 5, 21 4 Z" />
       <path class="memora-doodle-stroke" d="M45 4 C 36 6, 31 12, 31 19 C 31 26, 36 30, 42 30 C 47 30, 51 26, 51 21 C 51 16, 47 12, 42 12 C 42 8, 44 5, 47 4 Z" />`,
      { className, style }
    ),

  /** A long horizon wave for wide background sweeps. */
  wave: ({ className = '', style = '' } = {}) =>
    svg(
      '0 0 200 20',
      `<path class="memora-doodle-stroke-thin" d="M4 13 C 30 4, 56 4, 82 12 C 108 20, 134 20, 160 11 C 174 6, 188 6, 197 9" />`,
      { className, style }
    ),

  /** A tiny horizon line with a low sun. */
  mountain: ({ className = '', style = '' } = {}) =>
    svg(
      '0 0 120 56',
      `<path class="memora-doodle-stroke" d="M6 48 L 34 17 L 55 40 L 73 24 L 114 48" />
       <path class="memora-doodle-stroke-thin" d="M7 48 h107" />
       <circle class="memora-doodle-fill-strong" cx="97" cy="14" r="6.5" />`,
      { className, style }
    ),

  /** A dog-eared page corner. */
  paperCorner: ({ className = '', style = '' } = {}) =>
    svg(
      '0 0 42 42',
      `<path class="memora-doodle-stroke" d="M7 4 h18 l10 10 v23 a2 2 0 0 1 -2 2 h-26 a2 2 0 0 1 -2 -2 v-31 a2 2 0 0 1 2 -2 z" />
       <path class="memora-doodle-stroke-thin" d="M25 4 l10 10 h-10 z" />`,
      { className, style }
    ),
};

/**
 * Convenience wrapper: a ready-made background accent layer.
 * Pass placement via `doodles` — each entry is [doodleFn, options].
 *
 * @param {Array<[Function, Object]>} placements
 * @param {string} [modifiers] - extra classes for the layer itself
 */
export function doodleLayer(placements = [], modifiers = '') {
  if (placements.length === 0) return '';
  const marks = placements
    .map(([fn, options]) => fn(options))
    .join('');
  return `<div class="memora-doodles ${modifiers}" aria-hidden="true">${marks}</div>`;
}
