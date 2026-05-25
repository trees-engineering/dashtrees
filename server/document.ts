// Document text extraction — PDF via pdfjs-dist, Office formats via officeparser.
// Adapted from Treelance's scripts/bulk-import-jds.ts (self-contained, no bot code).
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import officeParser from 'officeparser';

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.rtf', '.odt', '.txt'];
const OFFICE_EXTENSIONS = ['.docx', '.doc', '.rtf', '.odt'];

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  'application/rtf': '.rtf',
  'text/rtf': '.rtf',
  'application/vnd.oasis.opendocument.text': '.odt',
  'text/plain': '.txt',
};

/** Resolve a file extension from the filename, falling back to the MIME type. */
export function resolveExtension(filename: string, mimeType?: string): string {
  const dot = filename.lastIndexOf('.');
  const fromName = dot >= 0 ? filename.slice(dot).toLowerCase() : '';
  if (SUPPORTED_EXTENSIONS.includes(fromName)) return fromName;
  if (mimeType && MIME_TO_EXT[mimeType]) return MIME_TO_EXT[mimeType];
  return fromName;
}

export function isSupported(filename: string, mimeType?: string): boolean {
  return SUPPORTED_EXTENSIONS.includes(resolveExtension(filename, mimeType));
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: unknown) => (item as { str?: string }).str ?? '')
      .join(' ');
    pages.push(text);
  }
  return pages.join('\n\n');
}

/**
 * Extract plain text from a document buffer. Returns '' when no text could be
 * read (e.g. a scanned PDF) so callers can fall back to vision OCR.
 */
export async function extractText(
  buffer: Buffer,
  filename: string,
  mimeType?: string,
): Promise<string> {
  const ext = resolveExtension(filename, mimeType);
  if (ext === '.pdf') return extractTextFromPdf(buffer);
  if (ext === '.txt') return buffer.toString('utf-8');
  if (OFFICE_EXTENSIONS.includes(ext)) {
    return (await officeParser.parseOfficeAsync(buffer)) ?? '';
  }
  throw new Error(`Unsupported file type: ${ext || mimeType || 'unknown'}`);
}
