// Violation: direct prisma.$queryRaw usage.
// Expected: no-restricted-syntax [no-raw-db-query] error.
declare const prisma: { $queryRaw: (strings: TemplateStringsArray) => Promise<unknown[]> };

export async function bad() {
  return prisma.$queryRaw`SELECT 1`;
}
