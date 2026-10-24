import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@ventora/config', '@ventora/contracts', '@ventora/i18n'],
};

export default nextConfig;
