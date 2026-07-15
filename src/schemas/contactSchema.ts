import { z } from 'zod';
import type { TFunction } from 'i18next';
import { CONTACT_SUBJECTS } from '@/domain/contact';

/** Validation for the footer "Contact us" form. Mirrored server-side in the API route. */
export const createContactFormSchema = (t: TFunction) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, t('validation.contact.enterName'))
      .max(80, t('validation.contact.nameTooLong')),
    email: z.string().trim().email(t('validation.contact.enterValidEmail')),
    subject: z.enum(CONTACT_SUBJECTS),
    message: z
      .string()
      .trim()
      .min(10, t('validation.contact.tellUsMore'))
      .max(2000, t('validation.contact.messageTooLong')),
  });

export type ContactForm = z.infer<ReturnType<typeof createContactFormSchema>>;
