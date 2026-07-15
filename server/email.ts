import { Resend } from 'resend';
import { serverEnv } from './env.js';
import type { ContactSubject } from '../src/domain/contact.js';

let client: Resend | null = null;
const resend = (): Resend => (client ??= new Resend(serverEnv().RESEND_API_KEY));

const shell = (title: string, bodyHtml: string): string => `
  <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 16px">${title}</h2>
    ${bodyHtml}
    <p style="color:#888;font-size:12px;margin-top:24px">Retire on Model</p>
  </div>`;

const button = (url: string, label: string): string =>
  `<a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">${label}</a>`;

/**
 * Better Auth swallows errors thrown from these callbacks (they run via
 * `runInBackgroundOrAwait`, which only logs and never surfaces to the API
 * response) — sign-up/reset-request calls still report success to the client
 * even if delivery fails. Log with enough context to diagnose from server logs.
 */
export const sendVerificationEmail = async (to: string, url: string): Promise<void> => {
  const { error } = await resend().emails.send({
    from: serverEnv().EMAIL_FROM,
    to,
    subject: 'Verify your email',
    html: shell(
      'Confirm your email',
      `<p>Click below to verify your address and activate your account.</p><p>${button(url, 'Verify email')}</p>`,
    ),
  });
  if (error) console.error('[email] verification email failed to send', { to, error });
};

export const sendResetPasswordEmail = async (to: string, url: string): Promise<void> => {
  const { error } = await resend().emails.send({
    from: serverEnv().EMAIL_FROM,
    to,
    subject: 'Reset your password',
    html: shell(
      'Reset your password',
      `<p>We received a request to reset your password. This link expires in 1 hour.</p><p>${button(url, 'Reset password')}</p><p style="color:#888;font-size:12px">If you didn't request this, ignore this email.</p>`,
    ),
  });
  if (error) console.error('[email] reset-password email failed to send', { to, error });
};

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Contact-form fields are attacker-controlled free text landing in an HTML email. */
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);

const SUBJECT_LABEL: Record<ContactSubject, string> = {
  problem: 'Problem',
  question: 'Question',
  feature: 'Feature request',
  other: 'Other',
};

export interface ContactMessage {
  name: string;
  email: string;
  subject: ContactSubject;
  message: string;
  /** Set when the sender was signed in, so support can match the message to an account. */
  userId: string | null;
}

/**
 * Deliver a footer contact-form submission to the support mailbox. Unlike the
 * Better Auth callbacks above, this is awaited by its route, so it reports failure
 * back rather than silently dropping the message. Reply-To is the sender, letting
 * support answer straight from the inbox.
 */
export const sendContactEmail = async (msg: ContactMessage): Promise<boolean> => {
  const { error } = await resend().emails.send({
    from: serverEnv().EMAIL_FROM,
    to: serverEnv().CONTACT_EMAIL_TO,
    replyTo: msg.email,
    subject: `[Contact · ${SUBJECT_LABEL[msg.subject]}] ${msg.name}`,
    html: shell(
      `${SUBJECT_LABEL[msg.subject]} from ${escapeHtml(msg.name)}`,
      `<p style="margin:0 0 4px"><b>From:</b> ${escapeHtml(msg.name)} &lt;${escapeHtml(msg.email)}&gt;</p>
       <p style="margin:0 0 16px;color:#888;font-size:12px">${msg.userId ? `Signed in · user ${escapeHtml(msg.userId)}` : 'Not signed in'}</p>
       <div style="white-space:pre-wrap;border-left:3px solid #e5e5e5;padding-left:12px">${escapeHtml(msg.message)}</div>`,
    ),
  });
  if (error) {
    console.error('[email] contact email failed to send', { from: msg.email, error });
    return false;
  }
  return true;
};
