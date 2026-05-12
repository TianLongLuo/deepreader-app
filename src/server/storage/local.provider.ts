import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { StorageProvider } from './storage.interface';
import { createChildLogger } from '@/lib/logger';

const log = createChildLogger('local-storage');

/**
 * Local filesystem storage provider for development.
 * Stores files relative to a configurable root directory.
 */
export class LocalStorageProvider implements StorageProvider {
  private root: string;

  constructor(root?: string) {
    this.root = root || process.env.STORAGE_LOCAL_ROOT || './storage';
  }

  private resolvePath(key: string): string {
    // Prevent path traversal
    const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    return path.join(this.root, normalized);
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    const filePath = this.resolvePath(key);
    const dir = path.dirname(filePath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, buffer);

    // Store metadata alongside the file
    const metaPath = filePath + '.meta.json';
    await fs.writeFile(
      metaPath,
      JSON.stringify({ contentType, size: buffer.length, uploadedAt: new Date().toISOString() })
    );

    log.debug({ key, size: buffer.length }, 'File uploaded to local storage');
    return key;
  }

  async download(key: string): Promise<Buffer> {
    const filePath = this.resolvePath(key);
    return fs.readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    try {
      await fs.unlink(filePath);
      await fs.unlink(filePath + '.meta.json').catch(() => {});
    } catch (error) {
      log.warn({ key, error }, 'Failed to delete file');
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.resolvePath(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    // For local development, return a simple token-based URL
    const token = crypto
      .createHmac('sha256', process.env.AUTH_SECRET || 'dev-secret')
      .update(`${key}:${Date.now() + expiresInSeconds * 1000}`)
      .digest('hex');

    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/api/storage/${encodeURIComponent(key)}?token=${token}&expires=${Date.now() + expiresInSeconds * 1000}`;
  }
}
