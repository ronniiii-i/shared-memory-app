import Pusher from 'pusher';

/**
 * Pusher server instance for triggering real-time events.
 *
 * Channel naming convention:
 *   - `album-{albumId}` — Album-scoped events (new photos, layout changes)
 *   - `photo-{photoId}` — Photo-scoped events (reactions, audio notes)
 *
 * Event types:
 *   - `photo:added`    — New photo uploaded to album
 *   - `photo:removed`  — Photo deleted from album
 *   - `photo:moved`    — Photo layout coordinates changed
 *   - `reaction:added` — New emoji reaction on a photo
 *   - `reaction:removed` — Reaction removed from a photo
 *   - `audio:added`    — New audio note attached to a photo
 *   - `member:joined`  — New member joined the album
 *   - `member:removed` — Member removed from the album
 */
export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

/**
 * Trigger a Pusher event on an album channel.
 */
export async function triggerAlbumEvent(
  albumId: string,
  event: string,
  data: Record<string, unknown>,
) {
  await pusher.trigger(`album-${albumId}`, event, data);
}

/**
 * Trigger a Pusher event on a photo channel.
 */
export async function triggerPhotoEvent(
  photoId: string,
  event: string,
  data: Record<string, unknown>,
) {
  await pusher.trigger(`photo-${photoId}`, event, data);
}
