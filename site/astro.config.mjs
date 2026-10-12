import { defineConfig } from 'astro/config';

// Static output, zero client JS. The guide is read from src/data/guide.yaml at build time.
export default defineConfig({
  output: 'static',
  build: { format: 'directory', inlineStylesheets: 'always' },
  devToolbar: { enabled: false },
  telemetry: false,
});
