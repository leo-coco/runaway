/**
 * The footer contact form's subject taxonomy. Shared by the client form (dropdown
 * options + validation) and the API (validation + email subject line), so the two
 * can never drift apart.
 */
export const CONTACT_SUBJECTS = ['problem', 'question', 'feature', 'other'] as const;

export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];
