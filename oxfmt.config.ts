import { defineConfig } from 'oxfmt';

export default defineConfig({
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  ignorePatterns: ['node_modules'],
  sortImports: {
    newlinesBetween: true,
    groups: [
      ['side_effect_style', 'side_effect'],
      'builtin',
      ['type-external', 'value-external'],
      [
        'type-parent',
        'type-sibling',
        'type-index',
        'value-parent',
        'value-sibling',
        'value-index',
      ],
      'style',
      'unknown',
    ],
  },
  sortPackageJson: true,
});
