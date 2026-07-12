import { Resend } from 'resend';
import { serverEnv } from './env.js';

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

/** Better Auth hands us the link; Resend handles delivery + deliverability. */
export const sendVerificationEmail = async (to: string, url: string): Promise<void> => {
  await resend().emails.send({
    from: serverEnv().EMAIL_FROM,
    to,
    subject: 'Verify your email',
    html: shell(
      'Confirm your email',
      `<p>Click below to verify your address and activate your account.</p><p>${button(url, 'Verify email')}</p>`,
    ),
  });
};

export const sendResetPasswordEmail = async (to: string, url: string): Promise<void> => {
  await resend().emails.send({
    from: serverEnv().EMAIL_FROM,
    to,
    subject: 'Reset your password',
    html: shell(
      'Reset your password',
      `<p>We received a request to reset your password. This link expires in 1 hour.</p><p>${button(url, 'Reset password')}</p><p style="color:#888;font-size:12px">If you didn't request this, ignore this email.</p>`,
    ),
  });
};
