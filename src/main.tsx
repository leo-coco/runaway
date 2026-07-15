import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import 'katex/dist/katex.min.css';
import './index.css';
import './i18n';
import './store/themeStore';
import { AppRoot } from './AppRoot';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found.');

createRoot(rootEl).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
);
