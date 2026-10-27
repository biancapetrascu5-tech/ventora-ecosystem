// configureAccess(@ventora/access) cannot be called here: Next.js 16 Turbopack
// compiles instrumentation.ts for both edge and nodejs runtimes; Prisma-generated
// clients (CJS, local path) cannot be bundled by Turbopack regardless of
// serverExternalPackages. Workaround: configureAccess is called at module load time
// in modules/booking/src/contract.ts until the access package is extracted to a
// compiled package or split into a Prisma-free entry point.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      await import('@ventora/config');
    } catch (error) {
      console.error(
        '\n[platform] Pornire refuzata:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  }
}
