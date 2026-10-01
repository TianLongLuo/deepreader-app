/** Single-purpose app worker. No credentials or source text in stdout/arguments. */
import {prisma} from '../src/lib/prisma';
import {claimJob,createEnrichmentJobs} from '../src/server/vocabulary/jobs';
import {abortableDelay} from '../src/server/reading-assistant/cancellation';
async function main(){
 const stop=new AbortController(),jobs=createEnrichmentJobs(prisma);let failures=0;
 const terminate=()=>stop.abort();process.once('SIGTERM',terminate);process.once('SIGINT',terminate);
 try{while(!stop.signal.aborted){
  try{const job=await claimJob(prisma,new Date());if(job){await jobs.runJob(job,stop.signal);const updated=await prisma.enrichmentJob.findUnique({where:{id:job.id},select:{status:true}});console.log(JSON.stringify({jobId:job.id,status:updated?.status||'removed'}));}failures=0;}
  catch{if(++failures>=3){console.error('Learning worker database unavailable');process.exitCode=1;break;}}
  await abortableDelay(2000,stop.signal).catch(()=>{});
 }}finally{process.removeListener('SIGTERM',terminate);process.removeListener('SIGINT',terminate);await prisma.$disconnect();}
}
void main().catch(()=>{console.error('Learning worker stopped');process.exitCode=1;});
