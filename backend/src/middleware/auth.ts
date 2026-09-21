import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'vibevault-super-secret-key-2026';

export interface AuthenticatedRequest extends Request {
  userId: string;
  username?: string;
}

/**
 * Global optional auth middleware (parses Bearer token if present)
 */
export function parseAuthHeader(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; username?: string };
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
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication token required. Please sign in.',
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; username?: string };
    (req as AuthenticatedRequest).userId = decoded.userId;
    (req as AuthenticatedRequest).username = decoded.username;
    next();
  } catch (err) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired authentication token. Please sign in again.',
    });
  }
}

/**
 * Generate a JWT token for a user
 */
export function generateUserToken(userId: string, username: string): string {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '30d' });
}
