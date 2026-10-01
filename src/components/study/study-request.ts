export class StudyRequestError extends Error{constructor(message:string,public status:number){super(message);}}
export async function studyRequest<T>(url:string,init:RequestInit={}):Promise<T>{
 const response=await fetch(url,{cache:'no-store',...init,headers:{'Content-Type':'application/json',...init.headers}});
 let value:any;try{value=await response.json();}catch{throw new StudyRequestError('学习数据加载失败，请重试',response.status||500);}
 if(!response.ok)throw new StudyRequestError(typeof value?.error==='string'?value.error:'请求失败，请重试',response.status);
 return value as T;
}
export function downloadStudy(text:string,name:string,type:string){const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
