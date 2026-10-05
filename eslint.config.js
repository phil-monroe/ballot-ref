import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/', 'site/dist/', 'data/', 'fixtures/', 'coverage/'] },
  ...tseslint.configs.recommended,
);
