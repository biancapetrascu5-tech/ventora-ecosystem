// VIOLATION: no-restricted-syntax (rawDbQuery)
// Proves the raw-query guard works: prisma.$queryRaw is forbidden outside db-kit.
declare const prisma: { $queryRaw: (strings: TemplateStringsArray) => Promise<unknown> };
void prisma.$queryRaw`SELECT 1`;
export {};
