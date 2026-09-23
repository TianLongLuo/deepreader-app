import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { createChildLogger } from '@/lib/logger';
import { getStorageProvider } from '../storage';
import { pdfParser } from './pdf.parser';
import { epubParser } from './epub.parser';
import { ParsedDocument, ParsedSection } from '@/types/documents';
import { hashText } from '@/lib/crypto';

const log = createChildLogger('parsing-service');

export class ParsingService {
  /**
   * Main entry point to parse a document and store its structure in the database.
   */
  async processDocument(documentId: string): Promise<void> {
    log.info({ documentId }, 'Starting document processing');
    
    // 1. Mark as processing
    await prisma.document.update({
      where: { id: documentId },
      data: { parseStatus: 'PROCESSING' }
    });

    try {
      const doc = await prisma.document.findUnique({
        where: { id: documentId }
      });

      if (!doc) throw new Error('Document not found');

      // 2. Download from storage
      const storage = getStorageProvider();
      const buffer = await storage.download(doc.storageKey);

      // 3. Parse based on file type
      let parsedDoc: ParsedDocument;
      if (doc.fileType === 'PDF') {
        parsedDoc = await pdfParser.parse(buffer, doc.title);
      } else if (doc.fileType === 'EPUB') {
        parsedDoc = await epubParser.parse(buffer, doc.title);
      } else {
        throw new Error(`Unsupported file type: ${doc.fileType}`);
      }

      // Commit the replacement structure and completed status together. A failed
      // insert must leave the previous text and its explanations intact.
      await prisma.$transaction(async (tx) => {
        await this.saveParsedDocument(tx, documentId, parsedDoc);
        await tx.document.update({
          where: { id: documentId },
          data: {
            parseStatus: 'COMPLETED',
            status: 'ACTIVE',
            pageCount: parsedDoc.pageCount || doc.pageCount,
            language: parsedDoc.language || doc.language,
            metadataJson: parsedDoc.metadata
              ? JSON.stringify(parsedDoc.metadata)
              : undefined,
          }
        });
      }, { timeout: 60_000 });

      log.info({ documentId }, 'Document processing completed successfully');

    } catch (error) {
      log.error({ documentId, error }, 'Document processing failed');
      
      await prisma.document.update({
        where: { id: documentId },
        data: { parseStatus: 'FAILED' }
      });
      
      throw error;
    }
  }

  private async saveParsedDocument(
    tx: Prisma.TransactionClient,
    documentId: string,
    parsedDoc: ParsedDocument
  ) {
    // Delete existing sections/paragraphs if this is a re-parse
    await tx.documentSection.deleteMany({ where: { documentId } });
    await tx.paragraph.deleteMany({ where: { documentId } });

    // Insert sections, then paragraphs iteratively to get their IDs.
    
    let globalParagraphOrder = 0;

    for (const section of parsedDoc.sections) {
      globalParagraphOrder = await this.saveSectionRecursive(
        tx, documentId, null, section, globalParagraphOrder
      );
    }
  }

  private async saveSectionRecursive(
    tx: Prisma.TransactionClient,
    documentId: string, 
    parentSectionId: string | null, 
    parsedSection: ParsedSection,
    startParagraphOrder: number
  ): Promise<number> {
    
    // Create section
    const sectionRecord = await tx.documentSection.create({
      data: {
        documentId,
        parentSectionId,
        title: parsedSection.title,
        orderIndex: parsedSection.orderIndex,
        anchor: `sec-${parsedSection.orderIndex}-${hashText(parsedSection.title).substring(0, 6)}`,
      }
    });

    // Bulk create paragraphs
    if (parsedSection.paragraphs.length > 0) {
      const paragraphDataArr = parsedSection.paragraphs.map((p, idx) => ({
        id: crypto.randomUUID(),
        documentId,
        sectionId: sectionRecord.id,
        orderIndex: startParagraphOrder + idx,
        pageNumber: p.pageNumber,
        rawText: p.rawText,
        normalizedText: p.normalizedText,
        textHash: hashText(p.normalizedText), // Critical for AI cache invalidation
        startOffset: 0,
        endOffset: p.rawText.length
      }));

      await tx.paragraph.createMany({
        data: paragraphDataArr
      });

      // Now create sentences for these
      for (let i = 0; i < parsedSection.paragraphs.length; i++) {
        const sentences = parsedSection.paragraphs[i].sentences;
        if (sentences.length > 0) {
            await tx.sentence.createMany({
                data: sentences.map((s, s_idx) => ({
                    paragraphId: paragraphDataArr[i].id,
                    orderIndex: s_idx,
                    rawText: s.rawText,
                    normalizedText: s.normalizedText,
                    startOffset: s.startOffset,
                    endOffset: s.endOffset
                }))
            });
        }
      }
    }

    let nextParagraphOrder = startParagraphOrder + parsedSection.paragraphs.length;

    // Process children recursively
    for (const child of parsedSection.children) {
      nextParagraphOrder = await this.saveSectionRecursive(
        tx,
        documentId, 
        sectionRecord.id, 
        child, 
        nextParagraphOrder
      );
    }

    return nextParagraphOrder;
  }
}

export const parsingService = new ParsingService();
