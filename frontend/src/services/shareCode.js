/**
 * Share-code rules, mirrored from backend/src/lib/shareCode.ts.
 *
 * The server is the authority — this exists only so the create/join forms can
 * show the code exactly as it will be stored, and can complain about an
 * obviously-unusable value before a round trip.
 */

/** Reserved words that would be confusing or unsafe to read aloud or type. */
const RESERVED_CODES = new Set([
  'ADMIN',
  'API',
  'NULL',
  'ROOT',
  'SYSTEM',
  'HELP',
  'ME',
  'YOU',
  'MEMORA',
  'LOGIN',
  'LOGOUT',
  'SIGNIN',
  'JOIN',
  'ALBUM',
  'ALBUMS',
]);

const MIN_LENGTH = 3;
const MAX_LENGTH = 24;

/**
 * Fold whatever a person typed — `summer road trip`, `Summer_Road-Trip!`, or a
 * whole pasted invite URL — into the single canonical code that will be stored.
 *
 * @returns {string} The canonical upper-case code, possibly empty.
 */
export function normalizeShareCode(input) {
  if (typeof input !== 'string') return '';

  // Accept a pasted invite link (`.../#/join/ABC123`) as well as a bare code.
  const fromLink = input.match(/#\/join\/([^/?#\s]+)/i);
  const raw = (fromLink ? fromLink[1] : input)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return raw.slice(0, MAX_LENGTH);
}

/**
 * @returns {{ code: string } | { error: string }}
 */
export function validateShareCode(input) {
  const code = normalizeShareCode(input);

  if (!code) return { error: 'Enter a code using letters or numbers' };
  if (code.length < MIN_LENGTH) {
    return { error: `Use at least ${MIN_LENGTH} characters so the code is hard to guess` };
  }
  if (RESERVED_CODES.has(code)) {
    return { error: `"${code}" is reserved — pick something else` };
  }

  return { code };
}

/** The alphabet the server generates from — no I/O/0/1, so codes read aloud cleanly. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A friendly default code to pre-fill, so starting an album does not feel like
 * a chore. Still validated and uniqueness-checked by the server on save.
 */
export function suggestShareCode(length = 6) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}
