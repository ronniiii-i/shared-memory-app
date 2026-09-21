import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, generateUserToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { users, albumMembers, photos } from '../db/schema.js';
import { eq, count } from 'drizzle-orm';

const router = Router();

/**
 * POST /api/users/register
 * Create a new account with username and password.
 * Body: { username, password, displayName?, avatarUrl? }
 */
router.post('/register', async (req, res) => {
  const { username, password, displayName, avatarUrl } = req.body;

  if (!username || username.trim().length < 3) {
    res.status(400).json({ error: 'Username must be at least 3 characters long' });
    return;
  }

  if (!password || password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters long' });
    return;
  }

  const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!cleanUsername) {
    res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    return;
  }

  // Check if username is already taken
  const existing = await db.query.users.findFirst({
    where: eq(users.username, cleanUsername),
  });

  if (existing) {
    res.status(409).json({ error: 'Username is already taken. Please choose another one or sign in.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = `user_${cleanUsername}_${Date.now().toString(36)}`;
  const avatar = avatarUrl || `https://api.dicebear.com/9.x/avataaars/svg?seed=${cleanUsername}`;
  const name = displayName?.trim() || cleanUsername;

  const [createdUser] = await db.insert(users).values({
    id: userId,
    username: cleanUsername,
    displayName: name,
    passwordHash,
    avatarUrl: avatar,
  }).returning();

  const token = generateUserToken(createdUser.id, createdUser.username);

  // Omit passwordHash from response
  const { passwordHash: _, ...userWithoutPassword } = createdUser;

  res.status(201).json({
    user: userWithoutPassword,
    token,
  });
});

/**
 * POST /api/users/login
 * Sign in with username and password.
 * Body: { username, password }
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const cleanUsername = username.trim().toLowerCase();

  const user = await db.query.users.findFirst({
    where: eq(users.username, cleanUsername),
  });

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const token = generateUserToken(user.id, user.username);
  const { passwordHash: _, ...userWithoutPassword } = user;

  res.json({
    user: userWithoutPassword,
    token,
  });
});

/**
 * GET /api/users/me
 * Get current authenticated user profile + stats.
 */
router.get('/me', requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Count memberships and uploaded photos
  const [albumsCount] = await db.select({ value: count() })
    .from(albumMembers)
    .where(eq(albumMembers.userId, userId));

  const [photosCount] = await db.select({ value: count() })
    .from(photos)
    .where(eq(photos.uploaderId, userId));

  const { passwordHash: _, ...userWithoutPassword } = user;

  res.json({
    ...userWithoutPassword,
    stats: {
      albumsCount: albumsCount?.value || 0,
      photosCount: photosCount?.value || 0,
    },
  });
});

/**
 * PATCH /api/users/profile
 * Update user display name, avatar, or password.
 * Body: { displayName?, avatarUrl?, currentPassword?, newPassword? }
 */
router.patch('/profile', requireAuth, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const { displayName, avatarUrl, currentPassword, newPassword } = req.body;

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const updates: Record<string, unknown> = {};

  if (displayName !== undefined) {
    updates.displayName = displayName.trim() || user.username;
  }

  if (avatarUrl !== undefined) {
    updates.avatarUrl = avatarUrl;
  }

  if (newPassword) {
    if (!currentPassword) {
      res.status(400).json({ error: 'Current password is required to set a new password' });
      return;
    }

    if (!user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters long' });
      return;
    }

    updates.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  const [updatedUser] = await db.update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning();

  const { passwordHash: _, ...userWithoutPassword } = updatedUser;

  res.json(userWithoutPassword);
});

export default router;
