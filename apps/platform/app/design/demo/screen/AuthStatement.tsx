import ro from '@ventora/i18n/messages/ro.json';

/* Fraza panoului AuthLayout (auth_line1 / auth_line2 din design). În producție vine din useTranslations('auth'). */
export function AuthStatement() {
  return (
    <>
      {ro.auth.line1}
      <br />
      {ro.auth.line2}
    </>
  );
}
