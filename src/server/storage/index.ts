import { StorageProvider } from './storage.interface';
import { LocalStorageProvider } from './local.provider';
import { S3StorageProvider } from './s3.provider';

let storageInstance: StorageProvider | null = null;

/**
 * Get the configured storage provider (singleton).
 * Uses STORAGE_PROVIDER env var to determine which provider to use.
 */
export function getStorageProvider(): StorageProvider {
  if (storageInstance) return storageInstance;

  const provider = process.env.STORAGE_PROVIDER || 'local';

  switch (provider) {
    case 's3':
      storageInstance = new S3StorageProvider();
      break;
    case 'local':
    default:
      storageInstance = new LocalStorageProvider();
      break;
  }

  return storageInstance;
}

/**
 * Generate a storage key for uploaded documents.
 */
export function generateStorageKey(
  workspaceId: string,
  documentId: string,
  fileType: string
): string {
  const extension = fileType.toLowerCase();
  return `uploads/${workspaceId}/${documentId}/source.${extension}`;
}
