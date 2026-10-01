import {expect,it} from 'vitest';
import {enrichmentResultSchema,taxonomyLabel} from '@/lib/vocabulary-taxonomy';
export const enrichmentFixture={lemma:'squint',selectedDictionarySenseId:null,meaning:{en:'Narrow your eyes against the wind.',zh:'迎着风眯起眼睛。'},pos:'verb',semanticCategory:'perception',domain:'daily.body.visual',contextTags:['outdoors'],collocations:['squint at a screen','squint in bright sunlight'],uncertain:true};
it('accepts fixed codes and rejects invented or POS-incompatible categories',()=>{
 expect(enrichmentResultSchema.parse(enrichmentFixture)).toEqual(enrichmentFixture);
 expect(()=>enrichmentResultSchema.parse({...enrichmentFixture,domain:'daily.fake'})).toThrow();
 expect(()=>enrichmentResultSchema.parse({...enrichmentFixture,semanticCategory:'object'})).toThrow();
 expect(()=>enrichmentResultSchema.parse({...enrichmentFixture,contextTags:['cycling-made-up']})).toThrow();
 expect(()=>enrichmentResultSchema.parse({...enrichmentFixture,collocations:['one']})).toThrow();
 expect(taxonomyLabel('daily.body.visual')).toContain('视觉');
});
