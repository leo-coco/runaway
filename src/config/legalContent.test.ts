import { describe, expect, it } from 'vitest';
import { isLegalIdentityComplete, legalField, type LegalIdentity } from './legal';
import { LEGAL_PATHS, legalDocument, type LegalPage } from './legalContent';

const PAGES: LegalPage[] = ['privacy', 'legal-notice', 'terms', 'sales-terms'];
const LANGS = ['fr', 'en'] as const;

const filledIdentity: LegalIdentity = {
  legalName: 'Jean Dupont',
  address: '1 rue de la Paix, 75002 Paris',
  siren: '123456789',
  publicationDirector: 'Jean Dupont',
  contactEmail: 'contact@example.com',
  privacyEmail: 'privacy@example.com',
  supportEmail: 'support@example.com',
  vatNumber: '',
  mediator: { name: 'Médiateur', address: '2 rue X, Paris', url: 'https://example.org' },
  hosting: { name: 'Vercel Inc.', address: '1 test street', phone: '+1 555 0100' },
  effectiveDate: '2026-07-21',
};

describe('legal identity', () => {
  it('is publishable once every field but the VAT number is filled', () => {
    expect(isLegalIdentityComplete(filledIdentity)).toBe(true);
  });

  it('is not publishable while a top-level field is missing', () => {
    expect(isLegalIdentityComplete({ ...filledIdentity, siren: '  ' })).toBe(false);
  });

  it('is not publishable while a nested field is missing', () => {
    expect(
      isLegalIdentityComplete({
        ...filledIdentity,
        hosting: { ...filledIdentity.hosting, phone: '' },
      }),
    ).toBe(false);
  });

  it('marks empty fields instead of rendering an empty string', () => {
    expect(legalField('', 'fr', 'numéro SIREN')).toBe('[à compléter : numéro SIREN]');
    expect(legalField('', 'en', 'SIREN number')).toBe('[to complete: SIREN number]');
    expect(legalField('  123 456 789 ', 'fr', 'numéro SIREN')).toBe('123 456 789');
  });
});

describe('legal documents', () => {
  it.each(LANGS)('builds every document in %s with non-empty sections', (lang) => {
    for (const page of PAGES) {
      const doc = legalDocument(lang, page);
      expect(doc.title).toContain('Runaway');
      expect(doc.intro.length).toBeGreaterThan(0);
      expect(doc.sections.length).toBeGreaterThan(0);
      for (const section of doc.sections) {
        expect(section.title.length).toBeGreaterThan(0);
        expect(section.blocks.length).toBeGreaterThan(0);
        for (const block of section.blocks) {
          if ('ul' in block) {
            expect(block.ul.length).toBeGreaterThan(0);
            for (const item of block.ul) expect(item.trim().length).toBeGreaterThan(0);
          } else {
            expect(block.p.trim().length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('keeps the same section count in both languages', () => {
    for (const page of PAGES) {
      expect(legalDocument('fr', page).sections).toHaveLength(
        legalDocument('en', page).sections.length,
      );
    }
  });

  it('exposes a French and English path for every page', () => {
    for (const page of PAGES) {
      expect(LEGAL_PATHS[page].fr.startsWith('/')).toBe(true);
      expect(LEGAL_PATHS[page].en.startsWith('/en/')).toBe(true);
    }
  });
});
