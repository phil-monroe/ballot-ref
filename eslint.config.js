import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/', 'site/dist/', 'data/', 'fixtures/', 'coverage/', 'tests/helpers/*.cjs', 'site/.astro/'] },
  ...tseslint.configs.recommended,
);
