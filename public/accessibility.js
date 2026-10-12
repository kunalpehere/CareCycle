(() => {
  const main = document.querySelector('main');
  if (main) {
    if (!main.id) main.id = 'main-content';
    if (!main.hasAttribute('tabindex')) main.tabIndex = -1;
  }
  document.querySelectorAll('.nav-links a.active').forEach((link) => link.setAttribute('aria-current', 'page'));
  document.querySelectorAll('[role="status"], .form-message, .request-message').forEach((node) => {
    if (!node.hasAttribute('aria-live')) node.setAttribute('aria-live', 'polite');
  });

  let invalidTimer;
  document.addEventListener('invalid', (event) => {
    event.target.setAttribute('aria-invalid', 'true');
    clearTimeout(invalidTimer);
    invalidTimer = setTimeout(() => {
      const form = event.target.form;
      if (!form) return;
      form.querySelector('.client-errors')?.remove();
      const fields = [...form.querySelectorAll(':invalid')];
      const summary = document.createElement('div');
      summary.className = 'validation-summary client-errors';
      summary.setAttribute('role', 'alert');
      summary.tabIndex = -1;
      const heading = document.createElement('strong');
      heading.textContent = 'Please correct the highlighted fields:';
      const list = document.createElement('ul');
      fields.forEach((field, index) => {
        if (!field.id) field.id = `field-${Date.now()}-${index}`;
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = `#${field.id}`;
        link.textContent = field.labels?.[0] ? [...field.labels[0].childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(' ').trim() || field.labels[0].textContent.trim() : field.name || 'Required field';
        item.append(link); list.append(item);
      });
      summary.append(heading, list);
      form.prepend(summary);
      summary.focus();
    }, 0);
  }, true);
  document.addEventListener('input', (event) => {
    if (event.target.matches('input,select,textarea') && event.target.validity?.valid) event.target.removeAttribute('aria-invalid');
  });

  document.querySelectorAll('input[type="file"]').forEach((input) => input.addEventListener('change', () => {
    input.parentElement.querySelector('.file-preview')?.remove();
    if (!input.files?.length) return;
    const preview = document.createElement('div');
    preview.className = 'file-preview';
    preview.setAttribute('aria-live', 'polite');
    [...input.files].forEach((file) => {
      const item = document.createElement('span');
      if (file.type.startsWith('image/')) {
        const image = document.createElement('img');
        image.src = URL.createObjectURL(file);
        image.alt = `Preview of ${file.name}`;
        image.addEventListener('load', () => URL.revokeObjectURL(image.src), { once: true });
        item.append(image);
      }
      item.append(document.createTextNode(`${file.name} (${Math.ceil(file.size / 1024)} KB)`));
      preview.append(item);
    });
    input.insertAdjacentElement('afterend', preview);
  }));

  const dialog = document.createElement('dialog');
  dialog.className = 'confirm-dialog';
  dialog.setAttribute('aria-labelledby', 'confirm-title');
  dialog.setAttribute('aria-describedby', 'confirm-message');
  dialog.innerHTML = '<form method="dialog"><h2 id="confirm-title">Confirm action</h2><p id="confirm-message"></p><div><button value="cancel">Cancel</button><button class="confirm-action" value="confirm">Continue</button></div></form>';
  document.body.append(dialog);
  let pendingForm;
  let trigger;
  document.querySelectorAll('form[data-confirm]').forEach((form) => form.addEventListener('submit', (event) => {
    if (form.dataset.confirmed === 'true') return;
    event.preventDefault();
    pendingForm = form;
    trigger = event.submitter || form.querySelector('button[type="submit"]');
    dialog.querySelector('p').textContent = form.dataset.confirm;
    dialog.returnValue = '';
    dialog.showModal();
    dialog.querySelector('button[value="cancel"]').focus();
  }));
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'confirm' && pendingForm) {
      pendingForm.dataset.confirmed = 'true';
      if (trigger?.form === pendingForm) pendingForm.requestSubmit(trigger);
      else pendingForm.requestSubmit();
      delete pendingForm.dataset.confirmed;
    } else trigger?.focus();
    pendingForm = null;
    trigger = null;
  });
  document.addEventListener('click', event => {
    const link = event.target.closest('.validation-summary a');
    if (!link) return;
    const field = document.getElementById(link.getAttribute('href')?.slice(1));
    if (field) { event.preventDefault(); field.focus(); field.scrollIntoView({ block: 'center' }); }
  });
})();
