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

describe('Footer legal links', () => {
  it('points at the English legal pages in English', () => {
    renderFooter(true);
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/en/privacy');
    expect(screen.getByRole('link', { name: 'Legal notice' })).toHaveAttribute(
      'href',
      '/en/legal-notice',
    );
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/en/terms');
    expect(screen.getByRole('link', { name: 'Sales terms' })).toHaveAttribute(
      'href',
      '/en/sales-terms',
    );
  });

  it('points at the unprefixed French legal pages in French', async () => {
    await i18n.changeLanguage('fr');
    renderFooter(true);
    expect(screen.getByRole('link', { name: 'Confidentialité' })).toHaveAttribute(
      'href',
      '/confidentialite',
    );
    expect(screen.getByRole('link', { name: 'Mentions légales' })).toHaveAttribute(
      'href',
      '/mentions-legales',
    );
    expect(screen.getByRole('link', { name: 'CGU' })).toHaveAttribute(
      'href',
      '/conditions-utilisation',
    );
    expect(screen.getByRole('link', { name: 'CGV' })).toHaveAttribute('href', '/conditions-vente');
  });
});
