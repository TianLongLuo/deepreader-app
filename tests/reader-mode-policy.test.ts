import {expect,it} from 'vitest';
import {selectionMode} from '../src/components/reader/reader-mode-policy';
it('distinguishes words and paragraphs',()=>{expect(selectionMode('corazón')).toBe('word');expect(selectionMode('straight-talking')).toBe('word');expect(selectionMode('Alice watched the light.')).toBe('paragraph');});
