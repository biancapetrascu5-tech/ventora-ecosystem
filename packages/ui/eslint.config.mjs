import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import boundaries from 'eslint-plugin-boundaries';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  { ignores: ['node_modules/**'] },
  ...compat.extends('eslint:recommended'),
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'package', pattern: 'packages/*' },
      ],
      'boundaries/root-path': '../../',
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
            'Property[key.name=/^(color|background|backgroundColor|borderColor|fill|stroke)$/][value.type="Literal"][value.value=/^(#|rgb|hsl)/]',
          message: '[no-inline-color] Use design tokens via var(--...) instead of hardcoded colors.',
        },
      ],
    },
  },
];

export default eslintConfig;
