/**
 * VibeVault — Pusher WebSockets Client
 */

import Pusher from 'pusher-js';
import { triggerLiveEmoji } from '../components/EmojiPhysics.js';

export { triggerLiveEmoji as triggerFloatingEmoji };

let pusherClient = null;
const activeSubscriptions = new Map();

/**
 * Initialize Pusher WebSocket Client
 */
export function initPusher() {
  const pusherKey = import.meta.env.VITE_PUSHER_KEY;
  const cluster = import.meta.env.VITE_PUSHER_CLUSTER || 'eu';

  if (!pusherKey) {
    console.warn('Pusher key missing (VITE_PUSHER_KEY). Real-time updates disabled.');
    return null;
  }

  if (!pusherClient) {
    pusherClient = new Pusher(pusherKey, {
      cluster,
      forceTLS: true,
    });
  }

  return pusherClient;
}

/**
 * Subscribe to Album Channel for real-time updates (photo added, layout moved, etc.)
 */
export function subscribeToAlbum(albumId, callbacks = {}) {
  const client = initPusher();
  if (!client) return () => {};

  const channelName = `album-${albumId}`;
  let channel = activeSubscriptions.get(channelName);

  if (!channel) {
    channel = client.subscribe(channelName);
    activeSubscriptions.set(channelName, channel);
  }

  if (callbacks.onPhotoAdded) {
    channel.bind('photo:added', callbacks.onPhotoAdded);
  }
  if (callbacks.onPhotoMoved) {
    channel.bind('photo:moved', callbacks.onPhotoMoved);
  }
  if (callbacks.onPhotoRemoved) {
    channel.bind('photo:removed', callbacks.onPhotoRemoved);
  }
  if (callbacks.onScrapbookCreated) {
    channel.bind('scrapbook:created', callbacks.onScrapbookCreated);
  }
  if (callbacks.onScrapbookUpdated) {
    channel.bind('scrapbook:updated', callbacks.onScrapbookUpdated);
  }
  if (callbacks.onScrapbookDeleted) {
    channel.bind('scrapbook:deleted', callbacks.onScrapbookDeleted);
  }
  if (callbacks.onScrapbookLockChanged) {
    channel.bind('scrapbook:lock-changed', callbacks.onScrapbookLockChanged);
  }

  return () => {
    if (channel) {
      if (callbacks.onPhotoAdded) channel.unbind('photo:added', callbacks.onPhotoAdded);
      if (callbacks.onPhotoMoved) channel.unbind('photo:moved', callbacks.onPhotoMoved);
      if (callbacks.onPhotoRemoved) channel.unbind('photo:removed', callbacks.onPhotoRemoved);
      if (callbacks.onScrapbookCreated) channel.unbind('scrapbook:created', callbacks.onScrapbookCreated);
      if (callbacks.onScrapbookUpdated) channel.unbind('scrapbook:updated', callbacks.onScrapbookUpdated);
      if (callbacks.onScrapbookDeleted) channel.unbind('scrapbook:deleted', callbacks.onScrapbookDeleted);
      if (callbacks.onScrapbookLockChanged) channel.unbind('scrapbook:lock-changed', callbacks.onScrapbookLockChanged);
    }
  };
}

/**
 * Subscribe to Photo Channel for real-time reactions and audio notes
 */
export function subscribeToPhoto(photoId, callbacks = {}) {
  const client = initPusher();
  if (!client) return () => {};

  const channelName = `photo-${photoId}`;
  let channel = activeSubscriptions.get(channelName);

  if (!channel) {
    channel = client.subscribe(channelName);
    activeSubscriptions.set(channelName, channel);
  }

  const handleReaction = (data) => {
    if (data.emoji) {
      triggerLiveEmoji(data.emoji);
    }
    if (callbacks.onReactionAdded) {
      callbacks.onReactionAdded(data);
    }
  };

  channel.bind('reaction:added', handleReaction);

  if (callbacks.onAudioAdded) {
    channel.bind('audio:added', callbacks.onAudioAdded);
  }

  return () => {
    if (channel) {
      channel.unbind('reaction:added', handleReaction);
      if (callbacks.onAudioAdded) channel.unbind('audio:added', callbacks.onAudioAdded);
    }
  };
}

/**
 * Unsubscribe from channel
 */
export function unsubscribeChannel(channelName) {
  if (pusherClient && activeSubscriptions.has(channelName)) {
    pusherClient.unsubscribe(channelName);
    activeSubscriptions.delete(channelName);
  }
}
