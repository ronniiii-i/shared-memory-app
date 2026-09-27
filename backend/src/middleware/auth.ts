import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

/**
 * Resolve the token-signing secret.
 *
 * A missing secret must never fall back to a committed constant in production:
 * the signing key is what makes a token unforgeable, so anyone holding that
 * string could mint a token for any user. Local development keeps the old
 * fallback so `npm run dev` works out of the box; a deployed build fails loudly
 * and immediately instead of silently serving forgeable tokens.
 */
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET is required in production. Generate one with: " +
        'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    );
  }

  return "vibevault-super-secret-key-2026";
}

const JWT_SECRET = resolveJwtSecret();

export interface AuthenticatedRequest extends Request {
  userId: string;
  username?: string;
}

/**
 * Global optional auth middleware (parses Bearer token if present)
 */
export function parseAuthHeader(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        userId: string;
        username?: string;
      };
      (req as AuthenticatedRequest).userId = decoded.userId;
      (req as AuthenticatedRequest).username = decoded.username;
    } catch (_) {
      // Invalid or expired token — proceed unauthenticated
    }
  }
  next();
}

/**
 * Enforce valid JWT token on protected endpoints
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  const queryToken =
    typeof req.query.token === "string" ? req.query.token : null;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : queryToken;

  if (!token) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Authentication token required. Please sign in.",
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      username?: string;
    };
    (req as AuthenticatedRequest).userId = decoded.userId;
    (req as AuthenticatedRequest).username = decoded.username;
    next();
  } catch (err) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired authentication token. Please sign in again.",
    });
  }
}

/**
 * Generate a JWT token for a user
 */
export function generateUserToken(userId: string, username: string): string {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: "30d" });
}
