import { RuleConfigSeverity, type UserConfig } from '@commitlint/types';

const { Error: E } = RuleConfigSeverity;

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'no-breaking-marker': ({ header, raw }) => [
          !/^\w+!:/.test(header ?? '') &&
            !/^BREAKING[ -]CHANGE:/m.test(raw ?? ''),
          'breaking changes are not marked in this repo — no `type!:` and no `BREAKING CHANGE:` footer',
        ],
      },
    },
  ],
  rules: {
    'type-empty': [E, 'never'],
    'type-case': [E, 'always', 'lower-case'],
    'type-enum': [
      E,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
      ],
    ],
    'scope-empty': [E, 'always'],
    'subject-empty': [E, 'never'],
    'subject-full-stop': [E, 'never', '.'],
    'subject-case': [
      E,
      'never',
      ['sentence-case', 'start-case', 'pascal-case', 'upper-case'],
    ],
    'header-max-length': [E, 'always', 72],
    'body-empty': [E, 'always'],
    'no-breaking-marker': [E, 'always'],
  },
} satisfies UserConfig;
