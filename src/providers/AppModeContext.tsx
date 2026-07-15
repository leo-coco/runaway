import { createContext, useContext, type ReactNode } from 'react';

interface AppMode {
  readonly sandbox: boolean;
}

const AppModeContext = createContext<AppMode>({ sandbox: false });

export const AppModeProvider = ({
  sandbox,
  children,
}: {
  sandbox: boolean;
  children: ReactNode;
}) => <AppModeContext.Provider value={{ sandbox }}>{children}</AppModeContext.Provider>;

export const useAppMode = (): AppMode => useContext(AppModeContext);
