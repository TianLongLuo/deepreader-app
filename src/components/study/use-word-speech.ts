'use client';
import {useEffect,useRef,useState} from 'react';
import {speakInBrowser} from '@/components/reader/language-tools';
import type {SourceLanguage} from '@/server/vocabulary/types';
export function useWordSpeech(){const controller=useRef<AbortController|null>(null),[notice,setNotice]=useState('');useEffect(()=>()=>controller.current?.abort(),[]);return {notice,speak:async(word:string,language:SourceLanguage)=>{controller.current?.abort();const signal=new AbortController();controller.current=signal;setNotice('');try{await speakInBrowser(word,language,signal.signal);}catch{if(!signal.signal.aborted)setNotice('发音暂不可用，可参考音标。');}}};}
