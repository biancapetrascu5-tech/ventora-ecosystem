import coreWebVitals from 'eslint-config-next/core-web-vitals';
import boundaries from 'eslint-plugin-boundaries';
import i18next from 'eslint-plugin-i18next';

const eslintConfig = [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '../../labs/violations/**'],
  },
  ...coreWebVitals,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'apps/*' },
        { type: 'module', pattern: 'modules/*' },
        { type: 'package', pattern: 'packages/*' },
        { type: 'lab', pattern: 'labs/*' },
      ],
      'boundaries/root-path': '../../',
      'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js', '.mjs'] } },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: { element: { type: 'app' } },
              allow: { to: { element: { type: 'package' } } },
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TaggedTemplateExpression > MemberExpression[property.name="$queryRaw"]',
          message: '[no-raw-db-query] Use the approved db-kit helper instead of prisma.$queryRaw.',
        },
        {
          selector: 'TaggedTemplateExpression > MemberExpression[property.name="$executeRaw"]',
          message:
            '[no-raw-db-query] Use the approved db-kit helper instead of prisma.$executeRaw.',
        },
        {
          selector: 'CallExpression[callee.name="withSystemContext"]',
          message:
            '[no-system-context-in-request] withSystemContext is forbidden in request handlers.',
        },
      ],
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': 'error',
    },
  },
];

export default eslintConfig;
