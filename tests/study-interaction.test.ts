import { expect, it } from 'vitest';
import { getStudyLanguage, wordSpanAtOffset, oppositeSide } from '@/components/reader/study-interaction';
it('defaults both English and Spanish books to English explanation',()=>{expect(getStudyLanguage('en',{})).toBe('en');expect(getStudyLanguage('es',{})).toBe('en');});
it('remembers choices independently and rejects invalid saved modes',()=>{expect(getStudyLanguage('es',{en:'bilingual',es:'es'})).toBe('es');expect(getStudyLanguage('en',{en:'es'})).toBe('en');});
it('places a right-side target on the left',()=>{expect(oppositeSide(800,0,1000)).toBe('left');expect(oppositeSide(200,0,1000)).toBe('right');});
it('finds Spanish accented words and English contractions with offsets',()=>{expect(wordSpanAtOffset('¿Dónde estás?',3)).toEqual({start:1,end:6,word:'Dónde'});expect(wordSpanAtOffset("I don't know.",4)?.word).toBe("don't");expect(wordSpanAtOffset('hello world',5)).toBeNull();});
