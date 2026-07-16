import { StrictMode } from 'react';
import { App } from './App';
import { BootError } from '@/components/BootError';
import { ENV_RESULT } from '@/config/env';
import { AppProviders } from '@/providers/AppProviders';
import { createServices } from '@/services/container';
import { seedSandboxIfEmpty } from '@/store';

// Seed the Sandbox demo plan before the store is read on first paint. Runs once
// on the client (this module is imported client-only), and no-ops elsewhere.
if (typeof window !== 'undefined') {
  seedSandboxIfEmpty(window.location.pathname);
}

export const AppRoot = () => {
  if (!ENV_RESULT.ok) {
    return (
      <StrictMode>
        <BootError issues={ENV_RESULT.issues} />
      </StrictMode>
    );
  }

  const services = createServices(ENV_RESULT.env);

  return (
    <StrictMode>
      <AppProviders services={services}>
        <App />
      </AppProviders>
    </StrictMode>
  );
};
