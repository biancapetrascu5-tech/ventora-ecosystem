import tsParser from '@typescript-eslint/parser';
import i18next from 'eslint-plugin-i18next';

/* ClientDesk (CR.0): the module's screens (src/ui, from CR-UI.1) follow the same text and component rules as
   apps/platform (CLAUDE.md): no literal UI text, no native <select>, common components only from
   @ventora/ui, no inline colors. */
export default [
  { ignores: ['node_modules/**', 'dist/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
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
      ],
    },
  },
  {
    files: ['src/**/*.tsx'],
    plugins: { i18next },
    rules: { 'i18next/no-literal-string': 'error' },
  },
];
