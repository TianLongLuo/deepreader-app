export type DocumentUploadType = 'PDF' | 'EPUB';
type UploadMetadata = { name: string; type: string };

function normalizedMime(type: string) {
  return type.split(';', 1)[0].trim().toLowerCase();
}

/** Browser/OS metadata is only a hint; the server validates the full container. */
export function canInspectDocumentSignature(file: UploadMetadata) {
  return ['', 'application/octet-stream', 'application/binary', 'application/zip',
    'application/x-zip', 'application/x-zip-compressed'].includes(normalizedMime(file.type));
}

export function getDocumentUploadType(file: UploadMetadata, signature?: Uint8Array): DocumentUploadType | null {
  const name = file.name.trim().toLowerCase();
  // A recognized extension wins over an incorrect OS MIME association.
  if (name.endsWith('.epub')) return 'EPUB';
  if (name.endsWith('.pdf')) return 'PDF';
  const mime = normalizedMime(file.type);
  if (['application/epub+zip', 'application/x-epub+zip'].includes(mime)) return 'EPUB';
  if (['application/pdf', 'application/x-pdf'].includes(mime)) return 'PDF';
  if (!signature || !canInspectDocumentSignature(file)) return null;
  if (signature[0] === 0x25 && signature[1] === 0x50 && signature[2] === 0x44 && signature[3] === 0x46) return 'PDF';
  if (signature[0] === 0x50 && signature[1] === 0x4b && signature[2] === 3 && signature[3] === 4) return 'EPUB';
  return null;
}
