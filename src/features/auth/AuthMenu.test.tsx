import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { AppModeProvider } from '@/providers/AppModeContext';
import { AuthMenu } from './AuthMenu';

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; name: string; email: string; role?: string },
}));

vi.mock('@/lib/authClient', () => ({
  useSession: () => ({
    data: authState.user ? { user: authState.user } : null,
    isPending: false,
  }),
  signOut: vi.fn(),
}));

vi.mock('@/store', () => {
  const useAppStore = Object.assign(() => undefined, {
    getState: () => ({ hydratePlans: vi.fn() }),
  });
  return { useAppStore };
});

vi.mock('@/features/settings/SettingsMenu', () => ({
  SettingsMenu: () => <div>Settings</div>,
}));

vi.mock('@/features/settings/AccessibilityMenu', () => ({
  AccessibilityMenu: () => <div>Accessibility</div>,
}));

vi.mock('./AuthDialog', () => ({
  AuthDialog: () => <div role="dialog">Authentication</div>,
}));

const renderMenu = (sandbox: boolean) =>
  render(
    <MemoryRouter>
      <AppModeProvider sandbox={sandbox}>
        <AuthMenu />
      </AppModeProvider>
    </MemoryRouter>,
  );

beforeEach(async () => {
  authState.user = {
    id: 'user-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    role: 'admin',
  };
  window.history.replaceState({}, '', '/en/app/sandbox');
  await i18n.changeLanguage('en');
});

describe('AuthMenu Sandbox identity isolation', () => {
  it('hides the connected identity and account actions in Sandbox', () => {
    renderMenu(true);
    fireEvent.click(screen.getByRole('button', { name: 'Sandbox mode' }));

    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'My account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Admin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.getByText('Sandbox mode')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Return to my account' })).toBeInTheDocument();
  });

  it('keeps the connected identity and account actions outside Sandbox', () => {
    renderMenu(false);
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'My account' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Return to my account' }),
    ).not.toBeInTheDocument();
  });
});
