import crypto from 'crypto';

/**
 * Share codes are the only handle a guest has on an album, so they are treated
 * as a real identifier: normalised, human-readable, and unique across every
 * album in the database (enforced by the `albums_share_code_unique` index plus
 * the case-insensitive check in `assertShareCodeAvailable`).
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
 * Fold whatever a person typed — `summer road trip`, `Summer_Road-Trip!`,
 * or a full invite URL — into a single canonical code.
 *
 * @returns The canonical upper-case code, or `null` if nothing usable remains.
 */
export function normalizeShareCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;

  // Accept a pasted invite link (`.../#/join/ABC123`) as well as a bare code.
  const fromLink = input.match(/#\/join\/([^/?#\s]+)/i);
  const raw = (fromLink ? fromLink[1] : input)
    .trim()
    .toUpperCase()
    // Keep letters and digits; collapse every run of punctuation to one dash.
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!raw) return null;
  return raw.slice(0, MAX_LENGTH);
}

/**
 * Validate a user-chosen share code, returning a message when it is unusable.
 * Codes are always upper-cased first, so `Trip26` and `TRIP26` are the same code.
 */
export function validateShareCode(input: unknown): { code: string } | { error: string } {
  const code = normalizeShareCode(input);

  if (!code) {
    return { error: 'Enter a code using letters or numbers' };
  }
  if (code.length < MIN_LENGTH) {
    return { error: `Use at least ${MIN_LENGTH} characters so the code is hard to guess` };
  }
  if (RESERVED_CODES.has(code)) {
    return { error: `"${code}" is reserved — pick something else` };
  }

  return { code };
}

/**
 * Generate a short, readable, unambiguous fallback code.
 * Excludes I/O/0/1 so codes survive being read aloud or written on paper.
 */
export function generateShareCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 12; attempt++) {
    let code = '';
    for (let i = 0; i < length; i++) {
      code += alphabet[crypto.randomInt(alphabet.length)];
    }
    if (!RESERVED_CODES.has(code)) return code;
  }
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

/**
 * True when a Postgres unique-violation surfaced, i.e. another request took
 * the code between our check and our write.
 */
export function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } })?.code;
  const causeCode = (err as { cause?: { code?: string } })?.cause?.code;
  return code === '23505' || causeCode === '23505';
}
