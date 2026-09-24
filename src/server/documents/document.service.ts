import { prisma } from '@/lib/prisma';
import { getStorageProvider, generateStorageKey } from '../storage';
import { createChildLogger } from '@/lib/logger';

const log = createChildLogger('document-service');

export class DocumentService {
  /**
   * Upload and register a new document in the system.
   */
  async uploadDocument(
    workspaceId: string,
    userId: string,
    title: string,
    fileType: 'PDF' | 'EPUB',
    buffer: Buffer,
    contentType: string
  ) {
    const documentId = crypto.randomUUID();
    const storageKey = generateStorageKey(workspaceId, documentId, fileType);
    
    log.info({ workspaceId, documentId, fileType, title }, 'Starting document upload');

    // 1. Upload to storage
    const storage = getStorageProvider();

    try {
      await storage.upload(storageKey, buffer, contentType);

      // 2. Create DB record
      return await prisma.document.create({
        data: {
          id: documentId,
          workspaceId,
          userId,
          title,
          fileType,
          storageKey,
          fileSize: buffer.length,
          status: 'PENDING',
          parseStatus: 'COMPLETED', // <--- We bypass backend parsing to allow instant EPUB rendering client-side!
        }
      });
    } catch (error) {
      try {
        await storage.delete(storageKey);
      } catch (cleanupError) {
        log.error({ storageKey, cleanupError }, 'Failed to clean up unregistered upload');
      }
      throw error;
    }
  }

  /**
   * List documents for a workspace.
   */
  async listDocuments(workspaceId: string, userId?: string) {
    return prisma.document.findMany({
      where: { workspaceId, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        fileType: true,
        status: true,
        parseStatus: true,
        language: true,
        pageCount: true,
        fileSize: true,
        createdAt: true,
        updatedAt: true,
        readingProgress: { where: { userId: userId ?? '' }, select: { location: true, percentage: true, updatedAt: true } }
      }
    });
  }

  /**
   * Get a document by ID.
   */
  async getDocument(documentId: string, workspaceId: string) {
    return prisma.document.findFirst({
      where: { id: documentId, workspaceId, status: { notIn: ['DELETED', 'DELETING'] } }
    });
  }

  /**
   * Get sections for reading interface.
   */
  async getSections(documentId: string) {
    // Only return top-level sections natively; children are joined
    return prisma.documentSection.findMany({
      where: { documentId, parentSectionId: null },
      orderBy: { orderIndex: 'asc' },
      include: {
        childSections: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    });
  }

  /**
   * Get paragraphs for a specific section.
   */
  async getParagraphs(sectionId: string, workspaceId: string) {
    return prisma.paragraph.findMany({
      where: { sectionId, document: { workspaceId, status: { notIn: ['DELETED', 'DELETING'] } } },
      orderBy: { orderIndex: 'asc' },
      include: {
        sentences: { orderBy: { orderIndex: 'asc' } }
      }
    });
  }

  /**
   * Delete a document, its stored file, and all bound reading artifacts.
   */
  async deleteDocument(documentId: string, workspaceId: string) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, workspaceId },
    });

    if (!document) {
      return null;
    }

    // Persist the intent before touching storage. Failed cleanup remains visible
    // in the library for retry, but cannot be opened as a readable document.
    await prisma.document.update({
      where: { id: document.id, workspaceId },
      data: { status: 'DELETING' },
    });

    const storage = getStorageProvider();
    await storage.delete(document.storageKey);

    await prisma.document.delete({
      where: { id: document.id, workspaceId },
    });

    log.info({ workspaceId, documentId }, 'Document deleted');
    return document;
  }
}

export const documentService = new DocumentService();
