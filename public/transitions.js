(() => {
  const style = document.createElement('style');
  style.textContent = `
    body { animation: cc-in .38s cubic-bezier(.2,.7,.2,1) both; }
    body.cc-leaving { animation: cc-out .18s ease both; pointer-events: none; }
    @keyframes cc-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes cc-out { to { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { body, body.cc-leaving { animation: none; } }
  `;
  document.head.append(style);
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || link.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname && destination.hash) return;
    event.preventDefault();
    document.body.classList.add('cc-leaving');
    window.setTimeout(() => { window.location.href = destination.href; }, 170);
  });
})();
