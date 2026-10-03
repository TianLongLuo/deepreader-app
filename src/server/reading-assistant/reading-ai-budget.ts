export type ReadingAIScope={workspaceId:string;userId:string};
export class ReadingAILimitError extends Error{readonly code='RATE_LIMITED';constructor(public readonly retryAfterSeconds=60){super('Reading AI rate limit');}}
const limits=new Map<string,{active:number;count:number;reset:number}>();
function quota(scope:ReadingAIScope){
 const now=Date.now(),owner=JSON.stringify([scope.workspaceId,scope.userId]);
 for(const [key,value] of limits)if(value.active===0&&value.reset<=now)limits.delete(key);
 let limit=limits.get(owner);
 if(!limit){if(limits.size>=256)throw new ReadingAILimitError();limit={active:0,count:0,reset:now+60000};limits.set(owner,limit);}
 if(limit.reset<=now){limit.count=0;limit.reset=now+60000;}
 if(limit.active>=2||limit.count>=24)throw new ReadingAILimitError(Math.max(1,Math.ceil((limit.reset-now)/1000)));
 return limit;
}
export function checkReadingAIQuota(scope:ReadingAIScope):void{quota(scope);}
export function acquireReadingAIQuota(scope:ReadingAIScope):()=>void{
 const limit=quota(scope);limit.active++;limit.count++;let released=false;
 return ()=>{if(released)return;released=true;limit.active--;};
}
