import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { AppModeProvider } from '@/providers/AppModeContext';
import { Footer } from './Footer';

vi.mock('@/features/contact/ContactModal', () => ({
  ContactModal: () => <div role="dialog">Contact modal</div>,
}));

const renderFooter = (sandbox: boolean) =>
  render(
    <AppModeProvider sandbox={sandbox}>
      <Footer />
    </AppModeProvider>,
  );

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('Footer Sandbox controls', () => {
  it('hides Contact us in Sandbox', () => {
    renderFooter(true);
    expect(screen.queryByRole('button', { name: 'Contact us' })).not.toBeInTheDocument();
  });

  it('keeps Contact us outside Sandbox', () => {
    renderFooter(false);
    expect(screen.getByRole('button', { name: 'Contact us' })).toBeInTheDocument();
  });
});
