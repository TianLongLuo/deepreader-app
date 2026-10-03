import {expect,it} from 'vitest';
import {selectionMode} from '../src/components/reader/reader-mode-policy';
it('distinguishes words and paragraphs',()=>{expect(selectionMode('corazón')).toBe('word');expect(selectionMode('straight-talking')).toBe('word');expect(selectionMode('Alice watched the light.')).toBe('paragraph');});
import {readingAction} from '@/components/reader/reader-mode-policy';
it('restores a replacement before validating a single original word',()=>{expect(readingAction({flipEnabled:true,gesture:'alt-enter',singleOriginalWord:false,oneReplacement:true})).toBe('restore');expect(readingAction({flipEnabled:true,gesture:'alt-enter',singleOriginalWord:true,oneReplacement:false})).toBe('flip');});
it.each(['edge','enter','selection'] as const)('blocks old analysis gesture %s while flipping',gesture=>expect(readingAction({flipEnabled:true,gesture,singleOriginalWord:true,oneReplacement:false})).toBe('none'));
it('keeps multiword and cross-occurrence selections inert, and ordinary reading unchanged',()=>{expect(readingAction({flipEnabled:true,gesture:'alt-enter',singleOriginalWord:false,oneReplacement:false})).toBe('none');expect(readingAction({flipEnabled:false,gesture:'click',singleOriginalWord:true,oneReplacement:false})).toBe('word');expect(readingAction({flipEnabled:false,gesture:'enter',singleOriginalWord:false,oneReplacement:false})).toBe('paragraph');});
