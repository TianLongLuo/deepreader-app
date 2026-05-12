import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64 string containing IV + ciphertext + auth tag.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Combine IV + tag + encrypted data
  const combined = Buffer.concat([
    iv,
    tag,
    Buffer.from(encrypted, 'hex'),
  ]);

  return combined.toString('base64');
}

/**
 * Decrypt a base64-encoded AES-256-GCM ciphertext.
 */
export function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedBase64, 'base64');

  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Mask an API key for display, showing only last 4 chars.
 * Example: "sk-abc123xyz" -> "sk-****xyz"
 */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  const prefix = key.substring(0, 3);
  const suffix = key.substring(key.length - 4);
  return `${prefix}****${suffix}`;
}

/**
 * Generate a deterministic hash of settings for cache invalidation.
 */
export function hashSettings(settings: Record<string, unknown>): string {
  const normalized = JSON.stringify(settings, Object.keys(settings).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Generate a hash of text content for deduplication.
 */
export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text.trim()).digest('hex');
}
