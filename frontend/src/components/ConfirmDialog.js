let activeDialog = null;

export function confirmDialog({
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
} = {}) {
  if (activeDialog) activeDialog.remove();

  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.setAttribute('role', 'presentation');
  overlay.innerHTML = `
    <section class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
      <div class="confirm-dialog-icon ${destructive ? 'is-destructive' : ''}">
        <i data-lucide="${destructive ? 'triangle-alert' : 'circle-help'}" aria-hidden="true"></i>
      </div>
      <h2 id="confirm-dialog-title" class="confirm-dialog-title"></h2>
      <p id="confirm-dialog-message" class="confirm-dialog-message"></p>
      <div class="confirm-dialog-actions">
        <button type="button" class="confirm-cancel">${cancelLabel}</button>
        <button type="button" class="confirm-submit ${destructive ? 'is-destructive' : ''}">${confirmLabel}</button>
      </div>
    </section>
  `;
  overlay.querySelector('.confirm-dialog-title').textContent = title;
  overlay.querySelector('.confirm-dialog-message').textContent = message;
  document.body.appendChild(overlay);
  activeDialog = overlay;

  const cancel = overlay.querySelector('.confirm-cancel');
  const submit = overlay.querySelector('.confirm-submit');
  const previousFocus = document.activeElement;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      overlay.classList.add('confirm-leaving');
      window.setTimeout(() => {
        overlay.remove();
        if (activeDialog === overlay) activeDialog = null;
        previousFocus?.focus?.();
      }, 150);
      resolve(value);
    };

    cancel.addEventListener('click', () => finish(false));
    submit.addEventListener('click', () => finish(true));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(false);
    });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') finish(false);
    });

    submit.focus();
  });
}
