import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Site tests each run an Astro build in the same project directory; running files one at a time
    // avoids them clobbering each other's .astro cache.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
