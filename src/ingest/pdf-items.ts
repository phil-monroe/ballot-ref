import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfItem {
  page: number;
  pageWidth: number;
  x: number;
  y: number;
  size: number;
  rotated: boolean;
  text: string;
}

const require = createRequire(import.meta.url);
const fontDir = join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + '/';

/** Positioned text items for every page (no layout decisions made here). */
export async function extractItems(data: Uint8Array): Promise<PdfItem[]> {
  const doc = await getDocument({
    data: new Uint8Array(data),
    standardFontDataUrl: pathToFileURL(fontDir).href,
    verbosity: 0,
  }).promise;
  const items: PdfItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { width } = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const t = it.transform as number[];
      items.push({
        page: p,
        pageWidth: width,
        x: t[4]!,
        y: t[5]!,
        size: Math.round(it.height),
        rotated: Math.abs(t[1]!) > 0.01,
        text: it.str.trim(),
      });
    }
  }
  return items;
}
