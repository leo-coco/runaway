import { Resend } from 'resend';
import { serverEnv } from './env.js';
import type { ContactSubject } from '../src/domain/contact.js';

let client: Resend | null = null;
const resend = (): Resend => (client ??= new Resend(serverEnv().RESEND_API_KEY));

type EmailLanguage = 'en' | 'fr';

const emailLanguage = (language: string | null | undefined): EmailLanguage =>
  language === 'fr' ? 'fr' : 'en';

const shell = (title: string, bodyHtml: string): string => `
  <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 16px">${title}</h2>
    ${bodyHtml}
    <p style="color:#888;font-size:12px;margin-top:24px">Retire on Model</p>
  </div>`;

/** The public asset is deliberately addressed from the canonical app URL: mail clients
 * cannot display a local/Vite asset and it keeps the illustration available after deploy. */
const verificationHeroUrl = (): string =>
  new URL('/verification-email-hero.png', serverEnv().BETTER_AUTH_URL).toString();

const passwordResetHeroUrl = (): string =>
  new URL('/password-reset-email-hero.png', serverEnv().BETTER_AUTH_URL).toString();

const verificationEmail = (url: string, language: EmailLanguage): string => {
  const copy =
    language === 'fr'
      ? {
          heroAlt: 'Une enveloppe Retire on Model',
          title: 'Bienvenue !',
          intro: 'Votre espace Retire on Model est presque prêt.',
          body: 'Confirmez votre adresse email pour activer votre compte et commencer à préparer votre avenir financier.',
          action: 'Confirmer mon adresse email',
          note: 'Si vous n’avez pas créé de compte, vous pouvez ignorer cet email.',
          footer: 'Votre trajectoire vers la liberté financière',
        }
      : {
          heroAlt: 'A Retire on Model envelope',
          title: 'Welcome!',
          intro: 'Your Retire on Model account is almost ready.',
          body: 'Confirm your email address to activate your account and start planning your financial future.',
          action: 'Confirm my email address',
          note: 'If you did not create an account, you can safely ignore this email.',
          footer: 'Your path to financial freedom',
        };

  return `
  <div style="margin:0;padding:32px 16px;background:#f8f6f2;font-family:Arial,Helvetica,sans-serif;color:#1f2328">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7ded1;border-radius:20px;overflow:hidden">
      <tr>
        <td style="padding:28px 32px 0;text-align:center">
          <div style="display:inline-block;padding:8px 14px;border:1px solid #eadcc7;border-radius:999px;background:#fbf6ec;color:#9a6f2f;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Retire on Model</div>
        </td>
      </tr>
      <tr>
        <td style="padding:22px 32px 18px;background:#faf9f7;text-align:center">
          <img src="${verificationHeroUrl()}" alt="${copy.heroAlt}" width="220" style="display:block;width:100%;max-width:220px;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none" />
        </td>
      </tr>
      <tr>
        <td style="padding:8px 40px 36px;text-align:center">
          <h1 style="margin:0 0 14px;color:#1f2328;font-size:28px;line-height:1.2;font-weight:700">${copy.title}</h1>
          <p style="margin:0 0 10px;color:#504638;font-size:16px;line-height:1.55">${copy.intro}</p>
          <p style="margin:0 0 26px;color:#504638;font-size:16px;line-height:1.55">${copy.body}</p>
          <a href="${url}" style="display:inline-block;background:#b88a44;border:1px solid #9a6f2f;border-radius:10px;color:#ffffff;font-size:16px;font-weight:700;line-height:1;text-decoration:none;padding:15px 24px;box-shadow:0 2px 4px rgba(95,62,18,0.18)">${copy.action}</a>
          <p style="margin:28px 0 0;color:#817667;font-size:12px;line-height:1.5">${copy.note}</p>
        </td>
      </tr>
    </table>
    <p style="max-width:560px;margin:18px auto 0;text-align:center;color:#817667;font-size:12px;line-height:1.5">Retire on Model · ${copy.footer}</p>
  </div>`;
};

const passwordResetEmail = (url: string, language: EmailLanguage): string => {
  const copy =
    language === 'fr'
      ? {
          heroAlt: 'Un coffre Retire on Model ouvert',
          title: 'Réinitialisez votre mot de passe',
          body: 'Nous avons reçu une demande de réinitialisation. Utilisez le bouton ci-dessous pour choisir un nouveau mot de passe sécurisé.',
          action: 'Réinitialiser mon mot de passe',
          note: 'Ce lien expire dans 1 heure. Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet email.',
          footer: 'Votre trajectoire vers la liberté financière',
        }
      : {
          heroAlt: 'An open Retire on Model safe',
          title: 'Reset your password',
          body: 'We received a password-reset request. Use the button below to choose a new secure password.',
          action: 'Reset my password',
          note: 'This link expires in 1 hour. If you did not request it, you can safely ignore this email.',
          footer: 'Your path to financial freedom',
        };

  return `
  <div style="margin:0;padding:32px 16px;background:#f8f6f2;font-family:Arial,Helvetica,sans-serif;color:#1f2328">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7ded1;border-radius:20px;overflow:hidden">
      <tr>
        <td style="padding:28px 32px 0;text-align:center">
          <div style="display:inline-block;padding:8px 14px;border:1px solid #eadcc7;border-radius:999px;background:#fbf6ec;color:#9a6f2f;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Retire on Model</div>
        </td>
      </tr>
      <tr>
        <td style="padding:22px 32px 18px;background:#faf9f7;text-align:center">
          <img src="${passwordResetHeroUrl()}" alt="${copy.heroAlt}" width="220" style="display:block;width:100%;max-width:220px;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none" />
        </td>
      </tr>
      <tr>
        <td style="padding:8px 40px 36px;text-align:center">
          <h1 style="margin:0 0 14px;color:#1f2328;font-size:28px;line-height:1.2;font-weight:700">${copy.title}</h1>
          <p style="margin:0 0 26px;color:#504638;font-size:16px;line-height:1.55">${copy.body}</p>
          <a href="${url}" style="display:inline-block;background:#b88a44;border:1px solid #9a6f2f;border-radius:10px;color:#ffffff;font-size:16px;font-weight:700;line-height:1;text-decoration:none;padding:15px 24px;box-shadow:0 2px 4px rgba(95,62,18,0.18)">${copy.action}</a>
          <p style="margin:28px 0 0;color:#817667;font-size:12px;line-height:1.5">${copy.note}</p>
        </td>
      </tr>
    </table>
    <p style="max-width:560px;margin:18px auto 0;text-align:center;color:#817667;font-size:12px;line-height:1.5">Retire on Model · ${copy.footer}</p>
  </div>`;
};

/**
 * Better Auth swallows errors thrown from these callbacks (they run via
 * `runInBackgroundOrAwait`, which only logs and never surfaces to the API
 * response) — sign-up/reset-request calls still report success to the client
 * even if delivery fails. Log with enough context to diagnose from server logs.
 */
export const sendVerificationEmail = async (
  to: string,
  url: string,
  language?: string | null,
): Promise<void> => {
  const locale = emailLanguage(language);
  const { error } = await resend().emails.send({
    from: serverEnv().EMAIL_FROM,
    to,
    subject:
      locale === 'fr'
        ? 'Bienvenue sur Retire on Model — confirmez votre adresse email'
        : 'Welcome to Retire on Model — confirm your email address',
    html: verificationEmail(url, locale),
  });
  if (error) console.error('[email] verification email failed to send', { to, error });
};

export const sendResetPasswordEmail = async (
  to: string,
  url: string,
  language?: string | null,
): Promise<void> => {
  const locale = emailLanguage(language);
  const { error } = await resend().emails.send({
    from: serverEnv().EMAIL_FROM,
    to,
    subject:
      locale === 'fr'
        ? 'Réinitialisez votre mot de passe — Retire on Model'
        : 'Reset your password — Retire on Model',
    html: passwordResetEmail(url, locale),
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
