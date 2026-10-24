import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

const nextConfig: NextConfig = {
  transpilePackages: ['@ventora/config', '@ventora/contracts', '@ventora/i18n'],
};

export default withSentryConfig(nextConfig);
