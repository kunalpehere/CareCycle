(() => {
  const toggle = document.querySelector('.menu-toggle');
  const links = document.querySelector('.nav-links');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    links.classList.toggle('open');
    if (!open) links.querySelector('a')?.focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !links.classList.contains('open')) return;
    links.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  });
  document.addEventListener('click', (event) => {
    if (!links.classList.contains('open') || event.target.closest('.home-nav')) return;
    links.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  });
})();
