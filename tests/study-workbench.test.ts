import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ReviewCardFront} from '@/components/study/review-workspace';
import StudyNavigation from '@/components/study/study-navigation';
import {VocabularyRow} from '@/components/study/vocabulary-list';
import type {ReviewFront} from '@/server/vocabulary/types';
import type {WordSummary} from '@/lib/vocabulary';
const front:ReviewFront={sessionId:'session',cardId:'card',version:0,word:'squint',sentence:'I squint against the wind.',sourceLanguage:'en',remaining:1};
it('has no answer, hidden grading buttons or dictionary data on the review front',()=>{
 const html=renderToStaticMarkup(createElement(ReviewCardFront,{front,onReveal:()=>{}}));expect(html).toContain('显示答案');expect(html).not.toContain('眯起眼睛');expect(html).not.toContain('想起来了');expect(html).not.toContain('dictionary');
});
it('keeps exactly three primary learning entrances and secondary reading records',()=>{
 const html=renderToStaticMarkup(createElement(StudyNavigation,{active:'vocabulary',onChange:()=>{}}));for(const label of ['词库','复习','AI 练习','阅读记录'])expect(html).toContain(label);expect(html.match(/role="tab"/g)).toHaveLength(3);
});
it('makes contextual rows compact with only two tags and no technical metadata',()=>{
 const item:WordSummary={id:'s',word:'squint',phonetic:'/skwɪnt/',contextMeaning:'眯起眼睛看',meaningOrigin:'ai',definitionLanguage:'zh',fallback:false,sentence:front.sentence,bookTitle:'Just Until',sourceLanguage:'en',tags:['visual','daily','third'],recognitionState:'new',usageState:'unpracticed',due:null,status:'unresolved'};
 const html=renderToStaticMarkup(createElement(VocabularyRow,{item,onDetail:()=>{},onDelete:()=>{}}));expect(html).toContain('眯起眼睛看');expect(html).toContain('尚未练习');expect(html).not.toContain('third');expect(html).not.toContain('rawNote');expect(html).not.toContain('Learning language');
});
