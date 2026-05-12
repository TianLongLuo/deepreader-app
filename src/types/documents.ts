import { z } from 'zod';

// ============================================================
// Document Types
// ============================================================

export const uploadDocumentSchema = z.object({
  title: z.string().min(1).max(500),
  fileType: z.enum(['PDF', 'EPUB']),
});

export interface DocumentDTO {
  id: string;
  title: string;
  fileType: string;
  status: string;
  parseStatus: string;
  language: string | null;
  pageCount: number | null;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSectionDTO {
  id: string;
  title: string;
  orderIndex: number;
  anchor: string;
  parentSectionId: string | null;
  children?: DocumentSectionDTO[];
}

export interface ParagraphDTO {
  id: string;
  orderIndex: number;
  pageNumber: number | null;
  rawText: string;
  normalizedText: string;
  textHash: string;
  sectionId: string | null;
  startOffset: number;
  endOffset: number;
}

export interface SentenceDTO {
  id: string;
  orderIndex: number;
  rawText: string;
  startOffset: number;
  endOffset: number;
}

// ============================================================
// Parsed Document Structure
// ============================================================

export interface ParsedSection {
  title: string;
  orderIndex: number;
  children: ParsedSection[];
  paragraphs: ParsedParagraph[];
}

export interface ParsedParagraph {
  rawText: string;
  normalizedText: string;
  pageNumber?: number;
  sentences: ParsedSentence[];
}

export interface ParsedSentence {
  rawText: string;
  normalizedText: string;
  startOffset: number;
  endOffset: number;
}

export interface ParsedDocument {
  title: string;
  language?: string;
  pageCount?: number;
  sections: ParsedSection[];
  metadata?: Record<string, unknown>;
}
