import { defineConfig } from 'astro/config';

// Static output, zero client JS. Data is read from ../data (or BALLOT_REF_DATA) at build time; the
// build makes no network calls. BALLOT_REF_OUT lets tests build into a temp directory.
export default defineConfig({
  output: 'static',
  outDir: process.env.BALLOT_REF_OUT ?? './dist',
  build: { format: 'directory', inlineStylesheets: 'always' },
  devToolbar: { enabled: false },
  telemetry: false,
});
