/**
 * Storage Provider Interface
 * Abstracts file storage to support both local filesystem and S3-compatible storage.
 */
export interface StorageProvider {
  /**
   * Upload a file buffer to storage.
   * @param key - Storage key (relative path, e.g., "uploads/{workspaceId}/{docId}/source.pdf")
   * @param buffer - File content
   * @param contentType - MIME type
   * @returns The storage key used
   */
  upload(key: string, buffer: Buffer, contentType: string): Promise<string>;

  /**
   * Download a file from storage.
   * @param key - Storage key
   * @returns File buffer
   */
  download(key: string): Promise<Buffer>;

  /**
   * Delete a file from storage.
   * @param key - Storage key
   */
  delete(key: string): Promise<void>;

  /**
   * Check if a file exists.
   * @param key - Storage key
   */
  exists(key: string): Promise<boolean>;

  /**
   * Generate a signed URL for temporary access.
   * @param key - Storage key
   * @param expiresInSeconds - URL expiration in seconds
   */
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}
