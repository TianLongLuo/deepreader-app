import { prisma } from '@/lib/prisma';
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

      // 4. Save structure to database
      await this.saveParsedDocument(documentId, parsedDoc);

      // 5. Update document status
      await prisma.document.update({
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

  private async saveParsedDocument(documentId: string, parsedDoc: ParsedDocument) {
    // Delete existing sections/paragraphs if this is a re-parse
    await prisma.documentSection.deleteMany({ where: { documentId } });
    await prisma.paragraph.deleteMany({ where: { documentId } });

    // Use transaction for bulk inserts where possible, but given the nested structure,
    // we'll insert sections, then paragraphs iteratively to get their IDs.
    
    let globalParagraphOrder = 0;

    for (const section of parsedDoc.sections) {
      await this.saveSectionRecursive(documentId, null, section, globalParagraphOrder);
      // approximate order advance
      globalParagraphOrder += section.paragraphs.length; 
    }
  }

  private async saveSectionRecursive(
    documentId: string, 
    parentSectionId: string | null, 
    parsedSection: ParsedSection,
    startParagraphOrder: number
  ): Promise<number> {
    
    // Create section
    const sectionRecord = await prisma.documentSection.create({
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

      await prisma.paragraph.createMany({
        data: paragraphDataArr
      });

      // Now create sentences for these
      for (let i = 0; i < parsedSection.paragraphs.length; i++) {
        const sentences = parsedSection.paragraphs[i].sentences;
        if (sentences.length > 0) {
            await prisma.sentence.createMany({
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
