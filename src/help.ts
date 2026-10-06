import './ui/styles.css';

// Link com âncora (ex.: /como-exportar#garmin) abre direto a seção daquele app.
function openFromHash(): void {
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (!(target instanceof HTMLDetailsElement)) return;
  document.querySelectorAll<HTMLDetailsElement>('details.app-card').forEach((d) => (d.open = d === target));
  target.scrollIntoView({ block: 'start' });
}

openFromHash();
window.addEventListener('hashchange', openFromHash);
