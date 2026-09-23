import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDocument, ParsedSection } from '../src/types/documents';

const mocks = vi.hoisted(() => ({
  prisma: {
    document: { update: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  parse: vi.fn(),
  download: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/logger', () => ({
  createChildLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));
vi.mock('../src/server/storage', () => ({
  getStorageProvider: () => ({ download: mocks.download }),
}));
vi.mock('../src/server/parsing/pdf.parser', () => ({
  pdfParser: { parse: mocks.parse },
}));
vi.mock('../src/server/parsing/epub.parser', () => ({
  epubParser: { parse: mocks.parse },
}));

import { ParsingService } from '../src/server/parsing/parsing.service';

type Row = Record<string, unknown>;
type State = {
  document: Row;
  sections: Row[];
  paragraphs: Row[];
  sentences: Row[];
  explanations: Row[];
};

function section(title: string, children: ParsedSection[] = []): ParsedSection {
  return {
    title,
    orderIndex: 0,
    children,
    paragraphs: [{
      rawText: title,
      normalizedText: title,
      sentences: [{ rawText: title, normalizedText: title, startOffset: 0, endOffset: title.length }],
    }],
  };
}

describe('atomic document re-parsing', () => {
  let state: State;
  let failAt: 'sentence' | 'completion' | undefined;

  beforeEach(() => {
    vi.resetAllMocks();
    failAt = undefined;
    state = {
      document: { id: 'doc', title: 'Old book', storageKey: 'book.pdf', fileType: 'PDF', parseStatus: 'COMPLETED', pageCount: 4 },
      sections: [{ id: 'old-section' }],
      paragraphs: [{ id: 'old-paragraph', rawText: 'Saved text' }],
      sentences: [{ paragraphId: 'old-paragraph', rawText: 'Saved text' }],
      explanations: [{ paragraphId: 'old-paragraph', outputJson: '{"saved":true}' }],
    };
    mocks.prisma.document.findUnique.mockImplementation(async () => ({ ...state.document }));
    mocks.prisma.document.update.mockImplementation(async ({ data }: { data: Row }) => {
      Object.assign(state.document, data);
      return state.document;
    });
    mocks.download.mockResolvedValue(Buffer.from('pdf'));
    mocks.parse.mockResolvedValue({ title: 'Replacement', pageCount: 5, sections: [section('New parent', [section('New child')]), section('Next section')] } satisfies ParsedDocument);

    // An isolated transactional store: writes become visible only when the
    // callback resolves, matching Prisma's commit/rollback contract.
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => {
      const draft = structuredClone(state);
      const tx = {
        documentSection: {
          deleteMany: async () => { draft.sections = []; },
          create: async ({ data }: { data: Row }) => {
            const row = { ...data, id: `section-${draft.sections.length}` };
            draft.sections.push(row);
            return row;
          },
        },
        paragraph: {
          deleteMany: async () => {
            draft.paragraphs = [];
            draft.sentences = [];
            draft.explanations = [];
          },
          createMany: async ({ data }: { data: Row[] }) => { draft.paragraphs.push(...data); },
        },
        sentence: {
          createMany: async ({ data }: { data: Row[] }) => {
            if (failAt === 'sentence') throw new Error('Sentence insert failed');
            draft.sentences.push(...data);
          },
        },
        document: {
          update: async ({ data }: { data: Row }) => {
            if (failAt === 'completion') throw new Error('Completion update failed');
            Object.assign(draft.document, data);
          },
        },
      };
      await callback(tx);
      state = draft;
    });
  });

  it.each(['sentence', 'completion'] as const)('preserves old text and explanations when %s fails', async (failure) => {
    failAt = failure;
    const previous = structuredClone(state);

    await expect(new ParsingService().processDocument('doc')).rejects.toThrow(/failed/);

    expect(state.sections).toEqual(previous.sections);
    expect(state.paragraphs).toEqual(previous.paragraphs);
    expect(state.sentences).toEqual(previous.sentences);
    expect(state.explanations).toEqual(previous.explanations);
    expect(state.document.pageCount).toBe(4);
    expect(state.document.parseStatus).toBe('FAILED');
  });

  it('commits a full replacement including nested paragraphs and completed metadata', async () => {
    await new ParsingService().processDocument('doc');

    expect(state.paragraphs.map((row) => row.rawText)).toEqual(['New parent', 'New child', 'Next section']);
    expect(state.paragraphs.map((row) => row.orderIndex)).toEqual([0, 1, 2]);
    expect(state.sentences).toHaveLength(3);
    expect(state.explanations).toEqual([]);
    expect(state.document).toMatchObject({ parseStatus: 'COMPLETED', status: 'ACTIVE', pageCount: 5 });
  });
});
