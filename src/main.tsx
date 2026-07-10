import { StrictMode } from 'react';
import { initSentry, sentryRootOptions } from './lib/sentry';
import { createRoot } from 'react-dom/client';
import './index.css';
import './theme/themes.css';
import App from './App';
import { ThemeProvider } from './theme/ThemeProvider';

initSentry();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')!, sentryRootOptions).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);
