/**
 * eslint.config.mjs — config dedicat fișierelor de violări din scripts/violations/.
 * Folosit exclusiv de scripts/guards-verify.mjs pentru a verifica că gardurile ESLint funcționează.
 */
import tsParser from '@typescript-eslint/parser';
import boundaries from 'eslint-plugin-boundaries';
import i18next from 'eslint-plugin-i18next';

export default [
  {
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'violation', pattern: 'scripts/violations/**' },
        { type: 'module', pattern: 'modules/**' },
        { type: 'package', pattern: 'packages/**' },
        { type: 'core', pattern: 'core/**' },
        { type: 'app', pattern: 'apps/**' },
      ],
      'boundaries/root-path': '.',
      'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js', '.mjs'] } },
    },
    files: ['**/*.{ts,tsx}'],
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: { element: { type: 'violation' } },
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
        {
          selector: 'JSXOpeningElement[name.name="select"]',
          message: '[no-native-select] Use Select from @ventora/ui instead of native <select>.',
        },
        {
          selector:
            "ImportDeclaration:not([source.value='@ventora/ui']) > ImportSpecifier[imported.name=/^(Button|Dialog|Input|Select|Modal|Badge|Checkbox|Label|Spinner|Toast|Alert)$/]",
          message: '[no-wrong-ui-import] Import common components from @ventora/ui only.',
        },
        {
          selector:
            'Property[key.name=/^(color|background|backgroundColor|borderColor|fill|stroke)$/][value.type="Literal"][value.value=/^(#|rgb|hsl)/]',
          message:
            '[no-inline-color] Use design tokens from @ventora/tokens instead of hardcoded colors.',
        },
        {
          selector: 'JSXAttribute[name.name="className"] > Literal[value=/\\[#[0-9a-fA-F]/]',
          message:
            '[no-tailwind-arbitrary-color] Use design tokens instead of arbitrary Tailwind color values.',
        },
      ],
    },
  },
  {
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { i18next },
    files: ['**/*.tsx'],
    rules: {
      'i18next/no-literal-string': 'error',
    },
  },
];
