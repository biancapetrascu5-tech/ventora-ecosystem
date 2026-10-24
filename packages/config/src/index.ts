import { z } from 'zod';

/**
 * Schema variabilelor de mediu ale ecosistemului Ventora.
 * Aplicația nu pornește dacă lipsește un secret obligatoriu sau e prea scurt.
 * @see docs/ARCHITECTURE.md §14
 */
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
  })
  .refine((data) => data.NODE_ENV !== 'production' || !!data.SENTRY_DSN, {
    message: 'SENTRY_DSN este obligatoriu în production. Setați-l în variabilele de mediu.',
    path: ['SENTRY_DSN'],
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validează variabilele de mediu la pornirea aplicației.
 * Aruncă eroare dacă ceva lipsește sau este invalid.
 */
function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Variabile de mediu invalide:');
    console.error(JSON.stringify(result.error.flatten().fieldErrors, null, 2));
    throw new Error('Configurare invalida. Verificati .env.local fata de .env.example.');
  }

  return result.data;
}

export const env: Env = validateEnv();
