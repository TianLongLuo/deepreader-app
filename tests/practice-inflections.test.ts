import {expect,it} from 'vitest';
import {validatePractice,validateSemantics} from '@/server/practice/validator';
const samples=[['hablar','Ayer habló con su colega.','habló'],['run','Yesterday she ran home.','ran'],['try','She tries every day.','tries']];
for(const [lemma,sentence,surface] of samples)it('accepts independently grounded '+lemma+' → '+surface+' without an exhaustive suffix list',()=>{
 const targets=[{senseId:'s',lemma,forms:[lemma],meaning:'Specific context',domain:null,revision:0}],passage=sentence+' '+('The team reviewed a clear plan before starting. ').repeat(10),exercise={passage,questions:[{id:'1',question:'What happened?',answer:sentence,quote:sentence},{id:'2',question:'What was reviewed?',answer:'A clear plan',quote:'The team reviewed a clear plan before starting.'}],applicationPrompt:'Describe the same action in a new situation.'};
 expect(()=>validatePractice({mode:'reading',targets,wordCount:100,value:exercise})).not.toThrow();
 expect(()=>validateSemantics({valid:true,targets:[{senseId:'s',correct:true,surface}],questionsGrounded:true,applicationAppropriate:true},targets,exercise,'reading')).not.toThrow();
 expect(()=>validateSemantics({valid:true,targets:[{senseId:'s',correct:true,surface:'invented-span'}],questionsGrounded:true,applicationAppropriate:true},targets,exercise,'reading')).toThrow();
 expect(()=>validateSemantics({valid:true,targets:[{senseId:'s',correct:true}],questionsGrounded:true,applicationAppropriate:true},targets,exercise,'reading')).toThrow();
});
