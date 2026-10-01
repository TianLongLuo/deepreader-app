'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createReadingStreamSession,type ReadingStreamState} from '@/lib/reading-stream-session';
import type {ReadingRequest} from '@/server/reading-assistant/service';
export function useReadingAnswerStream(){
 const [state,setState]=useState<ReadingStreamState>({draft:'',answer:null,busy:false,error:''});
 const session=useRef<ReturnType<typeof createReadingStreamSession>|null>(null);
 if(!session.current)session.current=createReadingStreamSession(setState);
 const start=useCallback((input:ReadingRequest)=>session.current!.start(input),[]);
 const reset=useCallback(()=>session.current!.reset(),[]);
 const stop=useCallback(()=>session.current!.stop(),[]);
 useEffect(()=>()=>session.current!.dispose(),[]);
 return {...state,start,stop,reset};
}
