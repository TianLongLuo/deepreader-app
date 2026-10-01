import {expect,it} from 'vitest';
import {parseSavedWord,targetSentence} from '@/lib/saved-word';
import {displayBookTitle,wordSpans} from '@/components/study/word-display';
it('prioritizes marked context meaning and preserves malformed JSON verbatim',()=>{
 const raw=JSON.stringify({sourceLanguage:'en',context:'I squint against the wind.',contextMeaning:{zh:'眯起眼睛看'},aiExplanation:'眯起眼睛看',meanings:[{partOfSpeech:'verb',definitions:[{definition:'斜视'}]}]});
 expect(parseSavedWord(raw,'squint').meaning.zh).toBe('眯起眼睛看');
 expect(parseSavedWord('{bad','squint')).toMatchObject({rawNote:'{bad',meaning:{},legacyContextMeaning:''});
 expect(displayBookTitle('Just Until (Joseph Moldover) (Z-Library).epub')).toBe('Just Until (Joseph Moldover)');
});
it('preserves legacy AI without guessing its language from dictionary settings',()=>{
 const value=parseSavedWord(JSON.stringify({definitionLanguage:'zh',aiExplanation:{answer:'A mixed 释义.'},context:'A word.'}),'word');
 expect(value.meaning).toEqual({});expect(value.legacyContextMeaning).toBe('A mixed 释义.');
 expect(value.legacyReviewAt).toBeNull();expect(value.legacyReviewCount).toBe(0);
 expect(parseSavedWord(JSON.stringify({aiMeaning:42,contextMeaning:{en:[],zh:42}}),'x').meaning).toEqual({});
});
it('keeps plain notes, HTML-like strings and unknown shapes as evidence, never fabricated dictionary meaning',()=>{
 for(const raw of ['ordinary note','<script>text</script>','null','[]','{"meanings":[{"definitions":[{"definition":"First dictionary sense"}]}]}']){
  const result=parseSavedWord(raw,'word');expect(result.rawNote).toBe(raw);expect(result.meaning).toEqual({});
 }
 const value=parseSavedWord('{"contextMeaning":{"en":"<img src=x>"}}','word');expect(value.meaning.en).toBe('<img src=x>');
});
it('selects the target sentence using word boundaries and Spanish accents',()=>{
 expect(targetSentence('A carpet lay there. The car stopped. He left.','car','en')).toBe('The car stopped.');
 expect(targetSentence('Hola. Tomó un café. Se fue.','café','es')).toBe('Tomó un café.');
 expect(targetSentence('She saw snowplow\'s tracks. It was cold.',"snowplow's",'en')).toBe("She saw snowplow's tracks.");
 expect(targetSentence('', 'absent','en')).toBe('');
 expect(targetSentence('x'.repeat(2000),'absent','en').length).toBeLessThanOrEqual(481);
});
it('highlights only full surfaces and preserves original text and case',()=>{
 const spans=wordSpans('Car in a carpet. CAR.','car');
 expect(spans.filter(s=>s.highlight).map(s=>s.text)).toEqual(['Car','CAR']);
 expect(spans.map(s=>s.text).join('')).toBe('Car in a carpet. CAR.');
 expect(wordSpans('Tomó café, no cafe.','café').filter(s=>s.highlight).map(s=>s.text)).toEqual(['café']);
 expect(displayBookTitle('Unknown [custom].PDF')).toBe('Unknown [custom]');
 expect(displayBookTitle('A'.repeat(300)+'.epub').length).toBeLessThanOrEqual(121);
});
it('matches NFC saved surfaces to decomposed Spanish context without changing original text',()=>{
 const text='Hola. Mi corazo\u0301n late.';
 expect(targetSentence(text,'corazón','es')).toBe('Mi corazo\u0301n late.');
 expect(wordSpans(text,'corazón').filter(s=>s.highlight).map(s=>s.text)).toEqual(['corazo\u0301n']);
 expect(wordSpans(text,'corazón').map(s=>s.text).join('')).toBe(text);
});
