import tsParser from '@typescript-eslint/parser';
import boundaries from 'eslint-plugin-boundaries';
import i18next from 'eslint-plugin-i18next';

/**
 * ESLint config used exclusively by scripts/guards-verify.mjs.
 * Applies all boundary guards so each violation file triggers exactly one rule.
 * NOT included in pnpm lint — violation files are excluded in app ESLint configs.
 *
 * eslint-plugin-boundaries v7: rule is `boundaries/dependencies`.
 * Selectors are objects. `from`/`allow` use { to: ... } wrapper.
 */
export default [
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: false },
    },
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'apps/*' },
        { type: 'module', pattern: 'modules/*' },
        { type: 'package', pattern: 'packages/*' },
        { type: 'lab', pattern: 'labs/*' },
      ],
      'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js', '.mjs'] } },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: { element: { type: 'lab' } },
              allow: { to: { element: { type: 'package' } } },
            },
            {
              from: { element: { type: 'app' } },
              allow: { to: { element: { type: 'package' } } },
            },
            {
              from: { element: { type: 'module' } },
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
