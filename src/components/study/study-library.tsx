'use client';
import {useState} from 'react';
import StudyNavigation,{type StudyTab} from './study-navigation';
import VocabularyList from './vocabulary-list';
import ReviewWorkspace from './review-workspace';
import ReadingRecords from './reading-records';
import PracticeWorkspace from './practice-workspace';
import type {MeaningLanguage,SourceLanguage} from '@/server/vocabulary/types';
export default function StudyLibrary(){
 const [tab,setTab]=useState<StudyTab>('vocabulary'),[sourceLanguage,setSourceLanguage]=useState<SourceLanguage|undefined>(),[definitionLanguage,setDefinitionLanguage]=useState<MeaningLanguage>('zh');
 return <main className="mx-auto w-full max-w-4xl px-4 py-8 text-foreground sm:px-8 sm:py-12"><header className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">学习</h1><p className="mt-2 text-sm text-muted-foreground">把阅读中遇见的词，练到认得、会用。</p></div>{tab!=='records'&&<div className="flex gap-2"><label className="sr-only" htmlFor="study-source-language">学习语言</label><select id="study-source-language" className="native-field w-auto text-xs" value={sourceLanguage??''} onChange={e=>setSourceLanguage(e.target.value?e.target.value as SourceLanguage:undefined)}><option value="">所有语言</option><option value="en">English</option><option value="es">Español</option></select><label className="sr-only" htmlFor="study-definition-language">释义语言</label><select id="study-definition-language" className="native-field w-auto text-xs" value={definitionLanguage} onChange={e=>setDefinitionLanguage(e.target.value as MeaningLanguage)}><option value="zh">{sourceLanguage==='en'?'英中释义':sourceLanguage==='es'?'西中释义':'中文释义'}</option><option value="en">{sourceLanguage==='en'?'英英释义':sourceLanguage==='es'?'西英释义':'英文释义'}</option></select></div>}</header><StudyNavigation active={tab} onChange={setTab}/>{tab==='vocabulary'?<VocabularyList definitionLanguage={definitionLanguage} sourceLanguage={sourceLanguage} onReview={()=>setTab('review')}/>:tab==='review'?<ReviewWorkspace definitionLanguage={definitionLanguage} sourceLanguage={sourceLanguage}/>:tab==='records'?<ReadingRecords/>:<PracticeWorkspace definitionLanguage={definitionLanguage} sourceLanguage={sourceLanguage}/>}</main>;
}
