import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), remove: vi.fn(), paragraphs: vi.fn(),
  upload: vi.fn(), deleteFile: vi.fn(), unlink: vi.fn(), error: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {
  document: { create: mocks.create, findFirst: mocks.findFirst, findMany: mocks.findMany, update: mocks.update, delete: mocks.remove },
  paragraph: { findMany: mocks.paragraphs },
} }));
vi.mock('@/server/storage', () => ({
  getStorageProvider: () => ({ upload: mocks.upload, delete: mocks.deleteFile }),
  generateStorageKey: () => 'uploads/workspace/new/source.pdf',
}));
vi.mock('@/lib/logger', () => ({ createChildLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: mocks.error }) }));
vi.mock('fs/promises', () => ({ default: { unlink: mocks.unlink } }));

import { DocumentService } from '../src/server/documents/document.service';
import { LocalStorageProvider } from '../src/server/storage/local.provider';

const service = new DocumentService();
let document: { id: string; storageKey: string; status: string } | null;

beforeEach(() => {
  vi.resetAllMocks();
  document = { id: 'doc', storageKey: 'file.pdf', status: 'ACTIVE' };
  mocks.findFirst.mockImplementation(async () => document ? { ...document } : null);
  mocks.update.mockImplementation(async ({ data }) => { Object.assign(document!, data); return document; });
  mocks.remove.mockImplementation(async () => { const old = document; document = null; return old; });
  mocks.upload.mockResolvedValue('uploads/workspace/new/source.pdf');
  mocks.deleteFile.mockResolvedValue(undefined);
  mocks.unlink.mockResolvedValue(undefined);
});

describe('document storage failure recovery', () => {
  it('does not touch the file if persisting deletion intent fails', async () => {
    mocks.update.mockRejectedValue(new Error('DB unavailable'));
    await expect(service.deleteDocument('doc', 'workspace')).rejects.toThrow('DB unavailable');
    expect(document?.status).toBe('ACTIVE');
    expect(mocks.deleteFile).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('retains DELETING state after storage failure and allows a retry', async () => {
    mocks.deleteFile.mockRejectedValueOnce(new Error('EACCES'));
    await expect(service.deleteDocument('doc', 'workspace')).rejects.toThrow('EACCES');
    expect(document?.status).toBe('DELETING');
    expect(mocks.remove).not.toHaveBeenCalled();
    await service.deleteDocument('doc', 'workspace');
    expect(document).toBeNull();
    expect(mocks.deleteFile).toHaveBeenCalledTimes(2);
  });

  it('keeps deletion retryable after storage succeeds but database removal fails', async () => {
    mocks.remove.mockRejectedValueOnce(new Error('DB locked'));
    await expect(service.deleteDocument('doc', 'workspace')).rejects.toThrow('DB locked');
    expect(document?.status).toBe('DELETING');
    await service.deleteDocument('doc', 'workspace');
    expect(document).toBeNull();
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'doc', workspaceId: 'workspace' }, data: { status: 'DELETING' } });
    expect(mocks.deleteFile).toHaveBeenCalledTimes(2);
  });

  it('does not mutate a document absent from the workspace', async () => {
    document = null;
    expect(await service.deleteDocument('doc', 'workspace')).toBeNull();
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: 'doc', workspaceId: 'workspace' } });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it('excludes deleting documents from reading while listing them for retry', async () => {
    await service.getDocument('doc', 'workspace');
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: 'doc', workspaceId: 'workspace', status: { notIn: ['DELETED', 'DELETING'] } } });
    await service.getParagraphs('section', 'workspace');
    expect(mocks.paragraphs).toHaveBeenCalledWith(expect.objectContaining({ where: { sectionId: 'section', document: { workspaceId: 'workspace', status: { notIn: ['DELETED', 'DELETING'] } } } }));
    await service.listDocuments('workspace');
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: 'workspace', status: { not: 'DELETED' } } }));
  });

  it('cleans up the uploaded object when database creation fails', async () => {
    const error = new Error('DB create failed');
    mocks.create.mockRejectedValue(error);
    await expect(service.uploadDocument('workspace', 'user', 'book', 'PDF', Buffer.from('pdf'), 'application/pdf')).rejects.toBe(error);
    expect(mocks.deleteFile).toHaveBeenCalledWith('uploads/workspace/new/source.pdf');
  });

  it('cleans up a partial storage upload without attempting database creation', async () => {
    const error = new Error('Metadata write failed after source file was written');
    mocks.upload.mockRejectedValue(error);
    await expect(service.uploadDocument('workspace', 'user', 'book', 'PDF', Buffer.from('pdf'), 'application/pdf')).rejects.toBe(error);
    expect(mocks.deleteFile).toHaveBeenCalledWith('uploads/workspace/new/source.pdf');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('preserves the original creation error and logs the key if cleanup also fails', async () => {
    const original = new Error('DB create failed');
    const cleanupError = new Error('Storage unavailable');
    mocks.create.mockRejectedValue(original);
    mocks.deleteFile.mockRejectedValue(cleanupError);
    await expect(service.uploadDocument('workspace', 'user', 'book', 'PDF', Buffer.from('pdf'), 'application/pdf')).rejects.toBe(original);
    expect(mocks.error).toHaveBeenCalledWith({ storageKey: 'uploads/workspace/new/source.pdf', cleanupError }, expect.any(String));
  });

  it('does not clean up a successfully registered upload', async () => {
    mocks.create.mockResolvedValue({ id: 'new' });
    await expect(service.uploadDocument('workspace', 'user', 'book', 'PDF', Buffer.from('pdf'), 'application/pdf')).resolves.toEqual({ id: 'new' });
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });
});

describe('idempotent local storage deletion', () => {
  const local = new LocalStorageProvider('test-storage');

  it('removes leftover metadata even if the source file is already missing', async () => {
    mocks.unlink.mockRejectedValueOnce(Object.assign(new Error('Missing'), { code: 'ENOENT' }));
    await expect(local.delete('source.pdf')).resolves.toBeUndefined();
    expect(mocks.unlink).toHaveBeenCalledTimes(2);
    expect(mocks.unlink.mock.calls[1][0]).toMatch(/source\.pdf\.meta\.json$/);
  });

  it('treats both missing files as a successful retry', async () => {
    mocks.unlink.mockRejectedValue(Object.assign(new Error('Missing'), { code: 'ENOENT' }));
    await expect(local.delete('source.pdf')).resolves.toBeUndefined();
  });

  it.each([0, 1])('propagates permission errors from file index %s', async (failureIndex) => {
    const failure = Object.assign(new Error('Denied'), { code: 'EACCES' });
    if (failureIndex === 1) mocks.unlink.mockResolvedValueOnce(undefined);
    mocks.unlink.mockRejectedValueOnce(failure);
    await expect(local.delete('source.pdf')).rejects.toBe(failure);
  });
});
