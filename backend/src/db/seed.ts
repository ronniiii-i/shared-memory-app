import { db, pool } from './index.js';
import { users, albums, albumMembers, photos, reactions, audioNotes } from './schema.js';
import crypto from 'crypto';

/**
 * Generates a random short code for album share links
 */
function generateShareCode(): string {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * Returns a random integer between min (inclusive) and max (inclusive)
 */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns a random element from an array
 */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generates a past timestamp within the last N days
 */
function randomPastDate(withinDays: number): Date {
  const now = Date.now();
  const offset = Math.random() * withinDays * 24 * 60 * 60 * 1000;
  return new Date(now - offset);
}

// ═══════════════════════════════════════════════════════════════
// Mock Data
// ═══════════════════════════════════════════════════════════════

const MOCK_USERS = [
  {
    id: 'user_mock_alice_001',
    username: 'alice_photo',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Alice',
  },
  {
    id: 'user_mock_bob_002',
    username: 'bob_captures',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Bob',
  },
  {
    id: 'user_mock_carol_003',
    username: 'carol_vibes',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Carol',
  },
];

const ALBUM_TITLES = [
  { title: 'Summer Beach Hangout 🏖️', description: 'Sun, sand, and good vibes at Malibu Beach' },
  { title: 'Rooftop Party NYC 🌃', description: 'Epic views and even better company' },
  { title: 'Camping Trip 🏕️', description: 'Disconnecting from everything and reconnecting with nature' },
];

// Placeholder photo URLs (using picsum for realistic mock photos)
const PHOTO_URLS = [
  'https://picsum.photos/seed/vv1/800/600',
  'https://picsum.photos/seed/vv2/600/800',
  'https://picsum.photos/seed/vv3/800/600',
  'https://picsum.photos/seed/vv4/700/700',
  'https://picsum.photos/seed/vv5/800/600',
  'https://picsum.photos/seed/vv6/600/800',
  'https://picsum.photos/seed/vv7/800/600',
  'https://picsum.photos/seed/vv8/700/500',
  'https://picsum.photos/seed/vv9/800/600',
  'https://picsum.photos/seed/vv10/600/800',
  'https://picsum.photos/seed/vv11/800/600',
  'https://picsum.photos/seed/vv12/700/700',
  'https://picsum.photos/seed/vv13/800/600',
  'https://picsum.photos/seed/vv14/600/800',
  'https://picsum.photos/seed/vv15/800/600',
];

const EMOJIS = ['🔥', '❤️', '😍', '🎉', '💯', '✨', '🙌', '😂', '🤩', '💖'];

const CAPTIONS = [
  'This view though!',
  'Living our best life',
  'Can we go back?',
  'Golden hour magic ✨',
  'Squad goals',
  'No filter needed',
  'Memories for life',
  'That sunset was unreal',
  'Good times only',
  'Vibe check: passed ✅',
  null, // some photos have no caption
  null,
  null,
];

// ═══════════════════════════════════════════════════════════════
// Seed Function
// ═══════════════════════════════════════════════════════════════

async function seed() {
  console.log('🌱 Starting VibeVault database seed...\n');

  // ── Step 1: Clear existing data (in reverse dependency order) ──
  console.log('🗑️  Clearing existing data...');
  await db.delete(audioNotes);
  await db.delete(reactions);
  await db.delete(photos);
  await db.delete(albumMembers);
  await db.delete(albums);
  await db.delete(users);
  console.log('   ✓ Tables cleared\n');

  // ── Step 2: Insert Users ──
  console.log('👤 Inserting users...');
  await db.insert(users).values(MOCK_USERS);
  console.log(`   ✓ Inserted ${MOCK_USERS.length} users\n`);

  // ── Step 3: Insert Albums ──
  console.log('📁 Creating albums...');
  const albumIds: string[] = [];

  for (const albumData of ALBUM_TITLES) {
    const albumId = crypto.randomUUID();
    albumIds.push(albumId);

    await db.insert(albums).values({
      id: albumId,
      title: albumData.title,
      description: albumData.description,
      shareCode: generateShareCode(),
      passcode: albumIds.length === 3 ? 'secret123' : null, // 3rd album has passcode
      createdAt: randomPastDate(30),
    });

    console.log(`   ✓ Created album: "${albumData.title}" (${albumId.slice(0, 8)}...)`);
  }
  console.log('');

  // ── Step 4: Insert Album Members ──
  console.log('👥 Adding album members...');
  let memberCount = 0;

  // Album 1: Alice is admin, Bob & Carol are contributors
  await db.insert(albumMembers).values([
    { albumId: albumIds[0], userId: MOCK_USERS[0].id, role: 'admin' as const },
    { albumId: albumIds[0], userId: MOCK_USERS[1].id, role: 'contributor' as const },
    { albumId: albumIds[0], userId: MOCK_USERS[2].id, role: 'contributor' as const },
  ]);
  memberCount += 3;

  // Album 2: Bob is admin, Alice is contributor
  await db.insert(albumMembers).values([
    { albumId: albumIds[1], userId: MOCK_USERS[1].id, role: 'admin' as const },
    { albumId: albumIds[1], userId: MOCK_USERS[0].id, role: 'contributor' as const },
  ]);
  memberCount += 2;

  // Album 3: Carol is admin, all are members
  await db.insert(albumMembers).values([
    { albumId: albumIds[2], userId: MOCK_USERS[2].id, role: 'admin' as const },
    { albumId: albumIds[2], userId: MOCK_USERS[0].id, role: 'contributor' as const },
    { albumId: albumIds[2], userId: MOCK_USERS[1].id, role: 'contributor' as const },
  ]);
  memberCount += 3;

  console.log(`   ✓ Added ${memberCount} memberships\n`);

  // ── Step 5: Insert Photos with randomized scrapbook layout ──
  console.log('📸 Adding photos with scrapbook coordinates...');
  const photoIds: string[] = [];
  let photoCount = 0;

  for (const albumId of albumIds) {
    // 4-6 photos per album
    const numPhotos = randInt(4, 6);

    for (let i = 0; i < numPhotos; i++) {
      const photoId = crypto.randomUUID();
      photoIds.push(photoId);

      const uploader = pickRandom(MOCK_USERS);
      const photoUrl = PHOTO_URLS[photoCount % PHOTO_URLS.length];

      await db.insert(photos).values({
        id: photoId,
        albumId,
        uploaderId: uploader.id,
        r2Url: photoUrl,
        caption: pickRandom(CAPTIONS),
        // Randomized scrapbook coordinates:
        // X: 50-900 (spread across a 1000px canvas)
        // Y: 50-700 (spread vertically)
        // Rotation: -15 to +15 degrees (slight tilt for scrapbook feel)
        layoutX: randInt(50, 900),
        layoutY: randInt(50, 700),
        rotation: randInt(-15, 15),
        width: randInt(250, 400),
        height: randInt(200, 350),
        createdAt: randomPastDate(14),
      });

      photoCount++;
    }
  }
  console.log(`   ✓ Added ${photoCount} photos across ${albumIds.length} albums\n`);

  // ── Step 6: Insert Reactions ──
  console.log('🔥 Adding reactions...');
  let reactionCount = 0;

  for (const photoId of photoIds) {
    // 0-4 reactions per photo
    const numReactions = randInt(0, 4);
    const usedUsers = new Set<string>();

    for (let i = 0; i < numReactions; i++) {
      const user = pickRandom(MOCK_USERS);
      // Avoid duplicate reactions from same user on same photo
      if (usedUsers.has(user.id)) continue;
      usedUsers.add(user.id);

      await db.insert(reactions).values({
        id: crypto.randomUUID(),
        photoId,
        userId: user.id,
        emoji: pickRandom(EMOJIS),
        createdAt: randomPastDate(7),
      });

      reactionCount++;
    }
  }
  console.log(`   ✓ Added ${reactionCount} reactions\n`);

  // ── Step 7: Insert Audio Notes (on a few photos) ──
  console.log('🎙️ Adding audio notes...');
  let audioCount = 0;
  const photosWithAudio = photoIds.slice(0, 4); // First 4 photos get audio notes

  for (const photoId of photosWithAudio) {
    const user = pickRandom(MOCK_USERS);

    await db.insert(audioNotes).values({
      id: crypto.randomUUID(),
      photoId,
      userId: user.id,
      audioUrl: `https://example.com/mock-audio/${crypto.randomUUID().slice(0, 8)}.webm`,
      duration: randInt(3, 10),
      createdAt: randomPastDate(5),
    });

    audioCount++;
  }
  console.log(`   ✓ Added ${audioCount} audio notes\n`);

  // ── Summary ──
  console.log('═══════════════════════════════════════');
  console.log('🎉 Seed complete!');
  console.log(`   • ${MOCK_USERS.length} users`);
  console.log(`   • ${albumIds.length} albums`);
  console.log(`   • ${memberCount} memberships`);
  console.log(`   • ${photoCount} photos`);
  console.log(`   • ${reactionCount} reactions`);
  console.log(`   • ${audioCount} audio notes`);
  console.log('═══════════════════════════════════════\n');
}

// ═══════════════════════════════════════════════════════════════
// Run
// ═══════════════════════════════════════════════════════════════

seed()
  .then(() => {
    console.log('✅ Seeder finished successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
