import { z } from 'zod';

/**
 * Schema variabilelor de mediu ale ecosistemului Ventora.
 * Aplicația nu pornește dacă lipsește un secret obligatoriu sau e prea scurt.
 * @see docs/ARCHITECTURE.md §14
 */
/** `NAME=` lăsat gol în .env (ca în .env.example) înseamnă „nesetat”, nu valoare invalidă. */
const emptyAsUnset = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    /**
     * DSN Sentry pentru observabilitate.
     * Obligatoriu în production; opțional în development și test.
     * Fiecare aplicație setează tag-ul app = platform | portal | founder.
     * @see docs/ARCHITECTURE.md §14 (Observabilitate)
     */
    SENTRY_DSN: z.string().url('SENTRY_DSN trebuie să fie un URL valid').optional(),

    /**
     * URL-uri aplicații — pentru redirect-uri și link-uri cross-app.
     * @see docs/ARCHITECTURE.md §3.1
     */
    NEXT_PUBLIC_PLATFORM_URL: z.string().url().default('http://localhost:3100'),
    NEXT_PUBLIC_PORTAL_URL: z.string().url().default('http://localhost:3101'),
    NEXT_PUBLIC_FOUNDER_URL: z.string().url().default('http://localhost:3102'),

    /**
     * Conexiuni runtime la Supabase prin transaction pooler (port 6543, pgbouncer=true).
     * Obligatorii în production și în orice mediu care pornește core/identity.
     * NU sunt folosite la migrări — migrările folosesc DIRECT_URL (session pooler 5432).
     * @see docs/ARCHITECTURE.md §6.2
     */
    DATABASE_URL: z.string().url('DATABASE_URL trebuie să fie un URL PostgreSQL valid').optional(),
    DATABASE_URL_FOUNDER: z
      .string()
      .url('DATABASE_URL_FOUNDER trebuie să fie un URL PostgreSQL valid')
      .optional(),

    /**
     * Mediul de deployment, când NODE_ENV=production nu ajunge ca să-l deosebim.
     * `staging` = singurul mediu production care pornește fără RESEND_API_KEY (decizia B-7 b).
     */
    APP_ENV: emptyAsUnset(z.enum(['staging', 'production']).optional()),

    /**
     * Cheie API Resend pentru trimiterea email-urilor.
     * - development / test: dacă lipsește, LogEmailAdapter (afișează în consolă, fără corp).
     * - production: obligatorie, cu excepția APP_ENV=staging, unde fiecare e-mail e marcat
     *   „failed” (not_configured) și auditat (B-7).
     */
    RESEND_API_KEY: emptyAsUnset(z.string().min(1).optional()),

    /** Expeditorul și Reply-To; implicit Ventora <noreply@ventora-hub.com> și support@ventorasystems.com. */
    EMAIL_FROM: emptyAsUnset(z.string().min(3).optional()),
    EMAIL_REPLY_TO: emptyAsUnset(
      z.string().email('EMAIL_REPLY_TO trebuie să fie o adresă de e-mail').optional(),
    ),
  })
  .refine((data) => data.NODE_ENV !== 'production' || !!data.SENTRY_DSN, {
    message: 'SENTRY_DSN este obligatoriu în production. Setați-l în variabilele de mediu.',
    path: ['SENTRY_DSN'],
  });

export type Env = z.infer<typeof envSchema>;

type RawEnv = Record<string, string | undefined>;

/**
 * Regulile care depind de valorile date explicit, nu de cele implicite din schemă:
 * în production, linkurile din e-mailuri nu au voie să cadă pe localhost (CFG.1), iar
 * e-mailurile reale cer furnizorul configurat (B-7 a), în afară de staging (B-7 b).
 */
function productionIssues(raw: RawEnv, data: Env): Array<{ path: string; message: string }> {
  if (data.NODE_ENV !== 'production') return [];
  const issues: Array<{ path: string; message: string }> = [];
  for (const key of ['NEXT_PUBLIC_PLATFORM_URL', 'NEXT_PUBLIC_FOUNDER_URL']) {
    if (!raw[key]) {
      issues.push({
        path: key,
        message: `${key} este obligatoriu în production (baza linkurilor din e-mailuri).`,
      });
    }
  }
  if (!raw.RESEND_API_KEY && data.APP_ENV !== 'staging') {
    issues.push({
      path: 'RESEND_API_KEY',
      message:
        'RESEND_API_KEY este obligatoriu în production. Doar staging (APP_ENV=staging) pornește fără el.',
    });
  }
  return issues;
}

/** Validează un set de variabile; folosit la pornire și în teste. */
export function parseEnv(
  raw: RawEnv,
): { success: true; data: Env } | { success: false; fieldErrors: Record<string, string[]> } {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const issues = productionIssues(raw, result.data);
  if (issues.length > 0) {
    const fieldErrors: Record<string, string[]> = {};
    for (const i of issues) (fieldErrors[i.path] ??= []).push(i.message);
    return { success: false, fieldErrors };
  }
  return { success: true, data: result.data };
}

/**
 * Validează variabilele de mediu la pornirea aplicației.
 * Aruncă eroare dacă ceva lipsește sau este invalid.
 */
function validateEnv(): Env {
  const result = parseEnv(process.env);

  if (!result.success) {
    console.error('Variabile de mediu invalide:');
    console.error(JSON.stringify(result.fieldErrors, null, 2));
    throw new Error('Configurare invalida. Verificati .env.local fata de .env.example.');
  }

  return result.data;
}

export const env: Env = validateEnv();
