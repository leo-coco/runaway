import { StrictMode } from 'react';
import { App } from './App';
import { BootError } from '@/components/BootError';
import { ENV_RESULT } from '@/config/env';
import { AppProviders } from '@/providers/AppProviders';
import { createServices } from '@/services/container';
import { seedEmptySandbox, seedSandboxIfEmpty, seedSandboxProfile } from '@/store';
import { asSandboxProfileId } from '@/store/seed';

// Seed the Sandbox demo plan before the store is read on first paint. Runs once
// on the client (this module is imported client-only), and no-ops elsewhere.
if (typeof window !== 'undefined') {
  const url = new URL(window.location.href);
  const profileId = asSandboxProfileId(url.searchParams.get('profile'));
  if (profileId) {
    seedSandboxProfile(url.pathname, profileId);
    url.searchParams.delete('profile');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  } else if (url.searchParams.get('start') === 'empty') {
    seedEmptySandbox(url.pathname);
    url.searchParams.delete('start');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  } else {
    seedSandboxIfEmpty(url.pathname);
  }
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
