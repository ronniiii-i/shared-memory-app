/**
 * VibeVault API Client — Handles REST requests with JWT authentication headers
 */

import { store } from '../core/Store.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function handleUnauthorized(endpoint) {
  const token = localStorage.getItem('vibevault-token');
  const isAuthRequest = endpoint.includes('/users/login') || endpoint.includes('/users/register');

  if (!token || isAuthRequest) return;

  localStorage.removeItem('vibevault-token');
  store.authNotice = { reason: 'expired' };
  store.currentUser = null;
  store.isAuthenticated = false;
}

async function parseError(res, endpoint) {
  if (res.status === 401) handleUnauthorized(endpoint);
  const err = await res.json().catch(() => ({ message: res.statusText }));
  return new Error(err.error || err.message || `Request ${endpoint} failed (${res.status})`);
}

/**
 * Get standard headers including JWT Authorization token from localStorage
 */
function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };

  const token = localStorage.getItem('vibevault-token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

export const api = {
  /**
   * GET Request
   */
  async get(endpoint) {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      throw await parseError(res, endpoint);
    }

    return res.json();
  },

  /**
   * POST Request
   */
  async post(endpoint, data = {}) {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      throw await parseError(res, endpoint);
    }

    return res.json();
  },

  /**
   * PATCH Request
   */
  async patch(endpoint, data = {}) {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      throw await parseError(res, endpoint);
    }

    return res.json();
  },

  /**
   * DELETE Request
   */
  async delete(endpoint) {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      throw await parseError(res, endpoint);
    }

    return res.json();
  },

  /**
   * Upload file directly to Cloudflare R2 Presigned S3 URL
   */
  async uploadToPresignedUrl(presignedUrl, file, contentType) {
    const res = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: file,
    });

    if (!res.ok) {
      throw new Error(`R2 Direct Upload failed (${res.status}: ${res.statusText})`);
    }

    return true;
  },
};
