import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['@prisma/client', 'prisma', '@prisma/adapter-pg', 'pg'],
};

export default config;
