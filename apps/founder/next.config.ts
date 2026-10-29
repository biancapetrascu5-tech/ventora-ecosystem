import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs/config';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  transpilePackages: ['@ventora/config', '@ventora/contracts', '@ventora/i18n', '@ventora/tokens'],
};

export default withSentryConfig(withNextIntl(nextConfig));
