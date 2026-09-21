import { createIcons, icons } from 'lucide';

const DEFAULT_DURATION = 4200;

function getContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function iconFor(type) {
  return {
    success: 'check-circle-2',
    error: 'circle-alert',
    warning: 'triangle-alert',
    info: 'info',
  }[type] || 'info';
}

export function showToast(message, { type = 'info', duration = DEFAULT_DURATION } = {}) {
  const container = getContainer();
  const toast = document.createElement('div');
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  toast.id = id;
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  toast.innerHTML = `
    <i data-lucide="${iconFor(type)}" class="toast-icon" aria-hidden="true"></i>
    <span class="toast-message"></span>
    <button type="button" class="toast-dismiss" aria-label="Dismiss notification">&times;</button>
  `;
  toast.querySelector('.toast-message').textContent = message;
  container.appendChild(toast);

  createIcons({ icons, nameAttr: 'data-lucide' });

  let timeoutId = null;
  const remove = () => {
    if (timeoutId) clearTimeout(timeoutId);
    toast.classList.add('toast-leaving');
    window.setTimeout(() => toast.remove(), 180);
  };

  toast.querySelector('.toast-dismiss').addEventListener('click', remove);
  if (duration > 0) timeoutId = window.setTimeout(remove, duration);
  return remove;
}

export const toast = {
  success(message, options = {}) { return showToast(message, { ...options, type: 'success' }); },
  error(message, options = {}) { return showToast(message, { ...options, type: 'error' }); },
  warning(message, options = {}) { return showToast(message, { ...options, type: 'warning' }); },
  info(message, options = {}) { return showToast(message, { ...options, type: 'info' }); },
};
