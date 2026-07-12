import { createContext, useContext, type ReactNode } from 'react';
import type { Services } from '@/services/container';

/**
 * Dependency injection for services. Components depend on this context, never on
 * concrete clients, which keeps the UI decoupled and makes services swappable in tests.
 */
const ServicesContext = createContext<Services | null>(null);

export const ServicesProvider = ({
  services,
  children,
}: {
  services: Services;
  children: ReactNode;
}): ReactNode => <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;

export const useServices = (): Services => {
  const ctx = useContext(ServicesContext);
  if (!ctx) {
    throw new Error('useServices must be used within a <ServicesProvider>.');
  }
  return ctx;
};
