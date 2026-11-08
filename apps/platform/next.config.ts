import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs/config';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  transpilePackages: [
    '@ventora/config',
    '@ventora/contracts',
    '@ventora/i18n',
    '@ventora/tokens',
    '@ventora/screens',
    // Lot B.1-UI: the module's screens (src/ui, CSS modules) and messages
    '@ventora/booking',
  ],
};

export default withSentryConfig(withNextIntl(nextConfig));
