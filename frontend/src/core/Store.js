/**
 * VibeVault — Global State Store (Proxy-based)
 *
 * Implements reactive state management using JavaScript Proxy objects.
 * When any property changes, a `stateChange` CustomEvent is dispatched
 * on `document`, carrying the changed key and new value.
 *
 * Components subscribe to state changes by listening for these events
 * and re-rendering when relevant state keys change.
 */

const STATE_CHANGE_EVENT = 'stateChange';

/**
 * Initial application state
 */
const initialState = {
  // Authentication
  currentUser: null,       // { id, username, avatarUrl } | null
  isAuthenticated: false,
  authNotice: null,        // { reason } | null when a session ended unexpectedly

  // Navigation
  activeAlbumId: null,     // string | null
  currentRoute: '',        // Current hash route

  // Theme
  theme: 'dark',           // 'dark' | 'light'

  // Data
  albums: [],              // Array of album objects
  photos: [],              // Array of photo objects for active album
  albumMembers: [],        // Members of the active album
  currentAlbumRole: null,  // 'admin' | 'contributor' | null

  // UI State
  isLoading: false,
  error: null,             // string | null
  uploadProgress: null,    // { current, total } | null
  isRecordingAudio: false,
  selectedPhotoId: null,   // For photo detail view
};

/**
 * Creates a deep reactive proxy that dispatches events on mutation.
 * Supports nested object reactivity.
 */
function createReactiveProxy(target, parentKey = '') {
  return new Proxy(target, {
    set(obj, prop, value) {
      const key = parentKey ? `${parentKey}.${String(prop)}` : String(prop);
      const oldValue = obj[prop];

      // Don't fire events for identical values (shallow comparison)
      if (oldValue === value) return true;

      // If the new value is a plain object (not array, not null), wrap it
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        obj[prop] = createReactiveProxy({ ...value }, key);
      } else {
        obj[prop] = value;
      }

      // Dispatch state change event
      document.dispatchEvent(new CustomEvent(STATE_CHANGE_EVENT, {
        detail: {
          key: String(prop),
          fullPath: key,
          value: obj[prop],
          oldValue,
          timestamp: Date.now(),
        },
      }));

      return true;
    },

    get(obj, prop) {
      return obj[prop];
    },

    deleteProperty(obj, prop) {
      const key = parentKey ? `${parentKey}.${String(prop)}` : String(prop);
      const oldValue = obj[prop];
      delete obj[prop];

      document.dispatchEvent(new CustomEvent(STATE_CHANGE_EVENT, {
        detail: {
          key: String(prop),
          fullPath: key,
          value: undefined,
          oldValue,
          timestamp: Date.now(),
        },
      }));

      return true;
    },
  });
}

/**
 * The global reactive store instance.
 * Import this in any module to read or write state.
 *
 * Usage:
 *   import { store } from '@/core/Store.js';
 *
 *   // Read state
 *   const user = store.currentUser;
 *
 *   // Write state (automatically triggers re-renders)
 *   store.currentUser = { id: '123', username: 'alice' };
 *   store.theme = 'light';
 */
export const store = createReactiveProxy({ ...initialState });

/**
 * Subscribe to specific state key changes.
 *
 * @param keys - Array of state keys to listen for
 * @param callback - Function called with event detail when any key changes
 * @returns Cleanup function to remove the listener
 *
 * Usage:
 *   const cleanup = subscribe(['currentUser', 'theme'], (detail) => {
 *     console.log(`${detail.key} changed to`, detail.value);
 *   });
 *   // Later: cleanup();
 */
export function subscribe(keys, callback) {
  const handler = (event) => {
    if (keys.includes(event.detail.key)) {
      callback(event.detail);
    }
  };

  document.addEventListener(STATE_CHANGE_EVENT, handler);

  return () => {
    document.removeEventListener(STATE_CHANGE_EVENT, handler);
  };
}

/**
 * Subscribe to ALL state changes (use sparingly).
 *
 * @param callback - Function called with event detail on any change
 * @returns Cleanup function
 */
export function subscribeAll(callback) {
  const handler = (event) => callback(event.detail);
  document.addEventListener(STATE_CHANGE_EVENT, handler);
  return () => document.removeEventListener(STATE_CHANGE_EVENT, handler);
}

/**
 * Batch multiple state updates without firing intermediate events.
 * Fires a single 'stateChange' event with key='_batch' after all updates.
 *
 * @param updater - Function that receives the raw state object
 */
export function batchUpdate(updater) {
  // Temporarily replace the proxy with direct object access
  const rawState = {};
  for (const key of Object.keys(initialState)) {
    rawState[key] = store[key];
  }

  updater(rawState);

  // Apply all changes (each will fire its own event)
  for (const [key, value] of Object.entries(rawState)) {
    if (store[key] !== value) {
      store[key] = value;
    }
  }
}

/**
 * Reset the store to initial state.
 */
export function resetStore() {
  for (const [key, value] of Object.entries(initialState)) {
    store[key] = value;
  }
}

/**
 * Get a snapshot of the current state (non-reactive plain object).
 */
export function getSnapshot() {
  const snapshot = {};
  for (const key of Object.keys(initialState)) {
    snapshot[key] = store[key];
  }
  return snapshot;
}

/**
 * Load persisted theme preference from localStorage.
 */
export function loadPersistedState() {
  const savedTheme = localStorage.getItem('vibevault-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    store.theme = savedTheme;
  }
}

// Auto-persist theme changes
subscribe(['theme'], (detail) => {
  localStorage.setItem('vibevault-theme', detail.value);
  document.documentElement.setAttribute('data-theme', detail.value);
});
