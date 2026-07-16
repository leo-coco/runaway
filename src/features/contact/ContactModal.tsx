import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/lib/authClient';
import { CONTACT_SUBJECTS } from '@/domain/contact';
import { createContactFormSchema, type ContactForm } from '@/schemas/contactSchema';
import { useAppMode } from '@/providers/AppModeContext';

interface Props {
  onClose: () => void;
}

export const ContactModal = ({ onClose }: Props) => {
  const { t } = useTranslation();
  const { data: sessionData } = useSession();
  const { sandbox } = useAppMode();
  const user = sandbox ? undefined : sessionData?.user;
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);
  const contactFormSchema = useMemo(() => createContactFormSchema(t), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContactForm>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      subject: 'question',
      message: '',
    },
  });

  const submit = async (form: ContactForm) => {
    setFailed(false);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`Contact request failed: ${res.status}`);
      setSent(true);
    } catch {
      setFailed(true);
    }
  };

  if (sent) {
    return (
      <Modal
        title={t('contact.sentTitle')}
        onClose={onClose}
        footer={
          <Button variant="primary" onClick={onClose}>
            {t('common.done')}
          </Button>
        }
      >
        <p className="modal__desc">{t('contact.sentDesc')}</p>
      </Modal>
    );
  }

  return (
    <Modal
      title={t('contact.title')}
      description={t('contact.desc')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleSubmit(submit)} disabled={isSubmitting}>
            {isSubmitting ? t('contact.sending') : t('contact.send')}
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field__label" htmlFor="contact-name">
          {t('contact.name')}
        </label>
        <input id="contact-name" className="search-input" {...register('name')} />
        {errors.name && <p className="field-error">{errors.name.message}</p>}
      </div>
      <div className="field">
        <label className="field__label" htmlFor="contact-email">
          {t('contact.email')}
        </label>
        <input
          id="contact-email"
          type="email"
          className="search-input"
          {...register('email')}
          readOnly={!!user}
        />
        {errors.email && <p className="field-error">{errors.email.message}</p>}
      </div>
      <div className="field">
        <label className="field__label" htmlFor="contact-subject">
          {t('contact.subject')}
        </label>
        <select id="contact-subject" className="select select--block" {...register('subject')}>
          {CONTACT_SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {t(`contact.subjects.${s}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="contact-message">
          {t('contact.message')}
        </label>
        <textarea
          id="contact-message"
          className="search-input contact-textarea"
          rows={6}
          {...register('message')}
        />
        {errors.message && <p className="field-error">{errors.message.message}</p>}
      </div>
      {/* Honeypot: hidden from users, a spam trap for bots. Kept out of the tab
          order and the accessibility tree so only automated fillers reach it. */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px' }}
        {...register('website')}
      />
      {failed && <p className="field-error">{t('contact.error')}</p>}
    </Modal>
  );
};
