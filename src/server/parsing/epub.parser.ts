import EPub from 'epub2';
import { load } from 'cheerio';
import { createChildLogger } from '@/lib/logger';
import { ParsedDocument, ParsedSection, ParsedParagraph } from '@/types/documents';
import { segmentParagraphs } from './segmentation';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const log = createChildLogger('epub-parser');

export class EpubParser {
  /**
   * Parse an EPUB buffer into a structured document format.
   * Note: epub2 requires a file path, so we write buffer to a temp file first.
   */
  async parse(buffer: Buffer, title: string): Promise<ParsedDocument> {
    log.info({ title, size: buffer.length }, 'Starting EPUB parse');
    
    const tempFilePath = path.join(os.tmpdir(), `temp-${Date.now()}.epub`);
    
    try {
      await fs.promises.writeFile(tempFilePath, buffer);
      
      const epub = await EPub.createAsync(tempFilePath);
      
      const parsedDoc: ParsedDocument = {
        title: epub.metadata.title || title,
        language: epub.metadata.language,
        sections: [],
        metadata: {
          creator: epub.metadata.creator,
          publisher: epub.metadata.publisher,
        }
      };

      // Iterate through spine
      let globalSectionIndex = 0;
      for (const chapter of epub.flow) {
        if (!chapter.id) continue;
        
        try {
          const chapterText = await epub.getChapterRawAsync(chapter.id);
          const rootSection = this.parseChapter(chapterText, chapter.title || `Chapter ${globalSectionIndex + 1}`, globalSectionIndex);
          if (rootSection.paragraphs.length > 0 || rootSection.children.length > 0) {
            parsedDoc.sections.push(rootSection);
            globalSectionIndex++;
          }
        } catch (err) {
          log.warn({ chapterId: chapter.id, error: err }, 'Failed to parse EPUB chapter');
        }
      }

      return parsedDoc;
    } catch (error) {
      log.error({ error }, 'EPUB parsing failed');
      throw new Error(`Failed to parse EPUB: ${(error as Error).message}`);
    } finally {
      // Cleanup temp file
      try {
        await fs.promises.unlink(tempFilePath);
      } catch (e) {
        // Ignore
      }
    }
  }

  private parseChapter(htmlText: string, title: string, orderIndex: number): ParsedSection {
    const $ = load(htmlText);
    
    const section: ParsedSection = {
      title,
      orderIndex,
      children: [],
      paragraphs: [],
    };

    // Extract text from paragraphs and headings
    $('p, h1, h2, h3, h4, h5, h6, li').each((_, el) => {
      const rawText = $(el).text().trim();
      if (rawText.length > 5) {
        const seg = segmentParagraphs(rawText);
        section.paragraphs.push({
          rawText,
          normalizedText: rawText.replace(/\s+/g, ' '),
          sentences: seg.sentences,
        });
      }
    });

    return section;
  }
}

export const epubParser = new EpubParser();
