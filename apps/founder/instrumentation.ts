export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      await import('@ventora/config');
    } catch (error) {
      console.error(
        '\n[founder] Pornire refuzata:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  }
}
