import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './index.css';
import './i18n';
import './store/themeStore';
import { App } from './App';
import { BootError } from '@/components/BootError';
import { AppProviders } from '@/providers/AppProviders';
import { ENV_RESULT } from '@/config/env';
import { createServices } from '@/services/container';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found.');

const root = createRoot(rootEl);

if (!ENV_RESULT.ok) {
  // Fail fast at boot with an actionable configuration screen.
  root.render(
    <StrictMode>
      <BootError issues={ENV_RESULT.issues} />
    </StrictMode>,
  );
} else {
  const services = createServices(ENV_RESULT.env);
  root.render(
    <StrictMode>
      <AppProviders services={services}>
        <App />
      </AppProviders>
    </StrictMode>,
  );
}
