import {requireAuth} from '@/lib/auth';
import {DictionaryError,dictionaryWordSchema,spanishDictionaryWordSchema,lookupDictionary} from '@/server/reading-assistant/dictionary';
/** Local dictionary metadata only. No AI/provider configuration or inference. */
export async function GET(req:Request){
 try{
  await requireAuth();const url=new URL(req.url),language=url.searchParams.get('language')||'en';
  if(language!=='en'&&language!=='es')return Response.json({error:'Unsupported language'},{status:400});
  const word=(language==='es'?spanishDictionaryWordSchema:dictionaryWordSchema).safeParse(url.searchParams.get('word'));
  if(!word.success)return Response.json({error:'Invalid word'},{status:400});
  const entry=await lookupDictionary(word.data,req.signal,language,'en');
  const parts=[...new Set(entry.meanings.flatMap(m=>m.partOfSpeech.split(/\s*\/\s*/)).filter(Boolean))].slice(0,8);
  return Response.json({parts},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){
  if(req.signal.aborted)return new Response(null,{status:499});
  const status=error instanceof Error&&error.message==='Authentication required'?401:error instanceof DictionaryError?error.status:502;
  return Response.json({error:status===401?'Authentication required':'词性暂未收录'},{status});
 }
}
