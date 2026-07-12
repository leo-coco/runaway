import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ServicesProvider } from './ServicesContext';
import { createQueryClient } from './queryClient';
import type { Services } from '@/services/container';

/** Root composition of injected services + the query client. */
export const AppProviders = ({
  services,
  children,
}: {
  services: Services;
  children: ReactNode;
}): ReactNode => {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ServicesProvider services={services}>{children}</ServicesProvider>
    </QueryClientProvider>
  );
};
