import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AccountPage } from './AccountPage';

const deleteUser = vi.fn();
const hydratePlans = vi.fn();
const setAllResidenceCountries = vi.fn();

// Exercise AccountPage in isolation: the persisted Zustand store touches
// browser storage that jsdom does not fully provide, and it is not the unit
// under test here.
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ hydratePlans, setAllResidenceCountries }),
}));

// BillingCard pulls in react-query + entitlements; it has its own test. This suite
// covers the profile/delete path, so stub it out.
vi.mock('@/features/billing/BillingCard', () => ({ BillingCard: () => null }));

vi.mock('@/lib/authClient', () => ({
  authClient: {
    deleteUser: (...args: unknown[]) => deleteUser(...args),
    updateUser: vi.fn(),
  },
  useSession: () => ({
    data: {
      user: { id: 'u1', name: 'Ada', email: 'ada@example.com', taxResidence: 'US' },
    },
  }),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/account']}>
      <Routes>
        <Route path="/account" element={<AccountPage />} />
        <Route path="/signin" element={<div>Sign in page</div>} />
      </Routes>
    </MemoryRouter>,
  );

const openDeleteModal = () => {
  fireEvent.click(screen.getByRole('button', { name: /Delete my account/i }));
  return screen.getByLabelText(/Confirm your password/i);
};

describe('AccountPage delete path', () => {
  beforeEach(() => {
    deleteUser.mockReset();
    hydratePlans.mockReset();
    setAllResidenceCountries.mockReset();
  });

  it('keeps the confirm button disabled until a password is entered', () => {
    renderPage();
    openDeleteModal();
    const confirm = screen.getByRole('button', { name: /Permanently delete my account/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Confirm your password/i), {
      target: { value: 'hunter2' },
    });
    expect(confirm).toBeEnabled();
  });

  it('passes the password to deleteUser and navigates to sign-in on success', async () => {
    deleteUser.mockResolvedValue({ error: null });
    renderPage();
    const passwordInput = openDeleteModal();
    fireEvent.change(passwordInput, { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: /Permanently delete my account/i }));

    await waitFor(() => expect(screen.getByText('Sign in page')).toBeInTheDocument());
    expect(deleteUser).toHaveBeenCalledWith({ password: 'hunter2' });
    expect(hydratePlans).toHaveBeenCalledWith([]);
  });

  it('shows a localized error for an incorrect password', async () => {
    deleteUser.mockResolvedValue({
      error: { code: 'INVALID_PASSWORD', message: 'raw api message' },
    });
    renderPage();
    const passwordInput = openDeleteModal();
    fireEvent.change(passwordInput, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /Permanently delete my account/i }));

    await waitFor(() => expect(screen.getByText('Incorrect password.')).toBeInTheDocument());
    expect(screen.queryByText('raw api message')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign in page')).not.toBeInTheDocument();
  });
});
