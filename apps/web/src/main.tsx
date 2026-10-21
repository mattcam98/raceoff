import '@fontsource-variable/bricolage-grotesque/wdth.css';
import '@fontsource-variable/figtree';
import './styles/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// A page left open across a redeploy asks for chunks that no longer exist; a reload picks up the new build.
window.addEventListener('vite:preloadError', () => {
  try {
    const last = Number(sessionStorage.getItem('raceoff.reloaded'));
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem('raceoff.reloaded', String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
