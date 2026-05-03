/* PrintRUSH Lopez — PDF/Document Page Count Detection (client-side, free)
   - PDF:        PDF.js (Mozilla, MIT) — exact count
   - DOCX/PPTX: fflate (ZIP) → parse docProps/app.xml — exact count
   - Images:     Always 1 page
   - Other:      Returns null (user enters manually)
*/

let _pdfjsLib  = null;
let _fflate    = null;

async function getPdfJs() {
  if (_pdfjsLib) return _pdfjsLib;
  _pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/build/pdf.min.mjs');
  _pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/build/pdf.worker.min.mjs';
  return _pdfjsLib;
}

async function getFflate() {
  if (_fflate) return _fflate;
  _fflate = await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js');
  return _fflate;
}

/** ── PDF: exact page count via PDF.js ── */
async function countPdfPages(file) {
  try {
    const pdfjsLib = await getPdfJs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    return doc.numPages;
  } catch {
    return null;
  }
}

/** ── DOCX / PPTX / XLSX: read ZIP → parse app.xml ── */
async function countOfficePages(file) {
  try {
    const fflate = await getFflate();
    const buf    = await file.arrayBuffer();
    const zip    = fflate.unzipSync(new Uint8Array(buf));
    const appXmlBytes = zip['docProps/app.xml'];
    if (!appXmlBytes) return null;
    const xml = new TextDecoder().decode(appXmlBytes);

    // DOCX → <Pages>N</Pages>
    let m = xml.match(/<Pages>(\d+)<\/Pages>/);
    if (m) return parseInt(m[1]);

    // PPTX → <Slides>N</Slides>
    m = xml.match(/<Slides>(\d+)<\/Slides>/);
    if (m) return parseInt(m[1]);

    // XLSX → <Sheets>N</Sheets> (each sheet = 1 "page" for printing)
    m = xml.match(/<Sheets>(\d+)<\/Sheets>/);
    if (m) return parseInt(m[1]);

    return null;
  } catch {
    return null;
  }
}

/**
 * Detect page count from a File object.
 * @param {File} file
 * @returns {{ pages: number|null, type: string, label: string }}
 */
export async function detectPages(file) {
  const name = file.name.toLowerCase();
  const ext  = name.split('.').pop();

  if (ext === 'pdf') {
    const pages = await countPdfPages(file);
    return { pages, type: 'pdf', label: 'PDF' };
  }
  if (ext === 'docx' || ext === 'doc') {
    const pages = await countOfficePages(file);
    return { pages, type: 'docx', label: 'Word Document' };
  }
  if (ext === 'pptx' || ext === 'ppt') {
    const pages = await countOfficePages(file);
    return { pages, type: 'pptx', label: 'Presentation' };
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const pages = await countOfficePages(file);
    return { pages, type: 'xlsx', label: 'Spreadsheet' };
  }
  if (['jpg','jpeg','png','gif','webp','bmp'].includes(ext)) {
    return { pages: 1, type: 'image', label: 'Image' };
  }
  return { pages: null, type: 'unknown', label: 'File' };
}

/**
 * Parse a page range string into a count of unique pages.
 * e.g. "1-5, 8, 10-12" with maxPages=20 → 9 pages
 * @param {string} rangeStr - e.g. "1-5, 8, 10-12"
 * @param {number} maxPages - total pages in document
 * @returns {{ count: number, valid: boolean, error: string|null }}
 */
export function parsePageRange(rangeStr, maxPages) {
  if (!rangeStr.trim()) return { count: 0, valid: false, error: 'Enter a page range' };
  const pages = new Set();
  const parts = rangeStr.split(',');
  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;
    if (t.includes('-')) {
      const [a, b] = t.split('-').map(s => parseInt(s.trim()));
      if (isNaN(a) || isNaN(b) || a < 1 || b < a) return { count: 0, valid: false, error: `Invalid range: "${t}"` };
      if (b > maxPages) return { count: 0, valid: false, error: `Page ${b} exceeds document length (${maxPages} pages)` };
      for (let i = a; i <= b; i++) pages.add(i);
    } else {
      const n = parseInt(t);
      if (isNaN(n) || n < 1) return { count: 0, valid: false, error: `Invalid page: "${t}"` };
      if (n > maxPages) return { count: 0, valid: false, error: `Page ${n} exceeds document length (${maxPages} pages)` };
      pages.add(n);
    }
  }
  return { count: pages.size, valid: pages.size > 0, error: null };
}
