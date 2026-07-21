import identity from './legal.json';

/**
 * Identity data the legal pages must publish, kept in `legal.json` so that
 * `astro.config.mjs` can read the same file to decide whether the legal pages
 * belong in the sitemap.
 *
 * Every field is information only the operator can supply (registration,
 * domiciliation, mediator subscription…). Leaving one empty is not a build
 * error: the pages render a visible `[à compléter]` marker instead, go
 * `noindex`, and stay out of the sitemap. Fill everything, and they become
 * publishable with no other change.
 */
export interface LegalIdentity {
  /** Full legal name of the operator (art. 6 III LCEN). */
  legalName: string;
  /** Registered business address published on the legal notice. */
  address: string;
  /** SIREN, assigned at registration. */
  siren: string;
  /** Name of the publication director (art. 6 III 2° LCEN). */
  publicationDirector: string;
  /** General contact mailbox published on the legal notice. */
  contactEmail: string;
  /** Mailbox handling GDPR requests. */
  privacyEmail: string;
  /** Mailbox handling order questions and complaints. */
  supportEmail: string;
  /** VAT number, or empty while under the art. 293 B CGI exemption. */
  vatNumber: string;
  /** Consumer mediator the operator has subscribed to (art. L612-1 C. conso.). */
  mediator: { name: string; address: string; url: string };
  /** Host of the site (art. 6 III LCEN requires name, address and phone). */
  hosting: { name: string; address: string; phone: string };
  /** Effective date shown on every legal page, ISO `YYYY-MM-DD`. */
  effectiveDate: string;
}

export const LEGAL_IDENTITY: LegalIdentity = identity;

/**
 * Completeness rule, mirrored in `astro.config.mjs`: every string in the file
 * must be filled except `vatNumber`, since staying under the art. 293 B CGI
 * exemption is a valid final state the sales terms state explicitly.
 */
const flatten = (value: LegalIdentity[keyof LegalIdentity]): string[] =>
  typeof value === 'string' ? [value] : Object.values(value);

export const isLegalIdentityComplete = (identity: LegalIdentity = LEGAL_IDENTITY): boolean =>
  Object.entries(identity)
    .filter(([key]) => key !== 'vatNumber')
    .every(([, value]) => flatten(value).every((field) => field.trim().length > 0));

/** Renders `value`, or a visible bracketed marker naming what is still missing. */
export const legalField = (value: string, lang: 'fr' | 'en', missingLabel: string): string =>
  value.trim().length > 0
    ? value.trim()
    : lang === 'fr'
      ? `[à compléter : ${missingLabel}]`
      : `[to complete: ${missingLabel}]`;
