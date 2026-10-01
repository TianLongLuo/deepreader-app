type Quoted={text:string;end:number;complete:boolean};
const escapes:Record<string,string>={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};
function quoted(buffer:string,start:number):Quoted{
 let text='',i=start+1;
 const incomplete=()=>({text,end:i,complete:false});
 while(i<buffer.length){
  const char=buffer[i];if(char==='"')return {text,end:i+1,complete:true};
  let code=char.charCodeAt(0),end=i+1;
  if(char==='\\'){
   if(i+1>=buffer.length)return incomplete();
   const escape=buffer[i+1];
   if(escape!=='u'){if(!(escape in escapes))return incomplete();text+=escapes[escape];i+=2;continue;}
   const hex=buffer.slice(i+2,i+6);if(!/^[\da-f]{4}$/i.test(hex))return incomplete();code=parseInt(hex,16);end=i+6;
  }else if(code<32)return incomplete();
  if(code>=0xd800&&code<=0xdbff){
   let low=buffer.charCodeAt(end),lowEnd=end+1;
   if(buffer.slice(end,end+2)==='\\u'){const hex=buffer.slice(end+2,end+6);if(!/^[\da-f]{4}$/i.test(hex))return incomplete();low=parseInt(hex,16);lowEnd=end+6;}
   if(!(low>=0xdc00&&low<=0xdfff))return incomplete();
   text+=String.fromCharCode(code,low);i=lowEnd;continue;
  }
  if(code>=0xdc00&&code<=0xdfff)return incomplete();
  text+=String.fromCharCode(code);i=end;
 }
 return incomplete();
}
/** Lexical top-level lookup; nested keys and strings containing the key are data. */
function topLevelValueStart(buffer:string,key:string):number{
 let i=buffer.match(/^\s*```(?:json)?\s*/i)?.[0].length??0;
 const space=()=>{while(/\s/.test(buffer[i]??'')&&i<buffer.length)i++;};
 space();if(buffer[i++]!=='{')return -1;
 while(i<buffer.length){
  space();if(buffer[i]!=='"')return -1;
  const name=quoted(buffer,i);if(!name.complete)return -1;i=name.end;space();if(buffer[i++]!==':')return -1;space();
  if(name.text===key)return i;
  // Skip one complete non-target value, respecting nested containers and escaped strings.
  let depth=0;
  while(i<buffer.length){
   const char=buffer[i];
   if(char==='"'){const value=quoted(buffer,i);if(!value.complete)return -1;i=value.end;continue;}
   if(char==='{'||char==='[')depth++;
   if(char==='}'||char===']'){if(depth===0)return -1;depth--;}
   if(char===','&&depth===0){i++;break;}
   i++;
  }
 }
 return -1;
}

export function readPartialString(buffer:string,key:string):string{
 const start=topLevelValueStart(buffer,key);return start>=0&&buffer[start]==='"'?quoted(buffer,start).text:'';
}
/** Complete array objects only; an unfinished object or escape is never guessed. */
export function readCompleteArrayObjects(buffer:string,key:string):unknown[]{
 let i=topLevelValueStart(buffer,key);if(i<0||buffer[i++]!=='[')return [];
 const values:unknown[]=[];
 while(i<buffer.length){
  while(/\s/.test(buffer[i]??'')&&i<buffer.length)i++;
  if(buffer[i]!=='{')return values;
  const start=i;let depth=0,complete=false;
  while(i<buffer.length){
   const char=buffer[i];
   if(char==='"'){const value=quoted(buffer,i);if(!value.complete)return values;i=value.end;continue;}
   if(char==='{'||char==='[')depth++;
   if(char==='}'||char===']')depth--;
   i++;if(depth===0){complete=true;break;}
  }
  if(!complete)return values;values.push(JSON.parse(buffer.slice(start,i)));
  while(/\s/.test(buffer[i]??'')&&i<buffer.length)i++;
  if(buffer[i++]!==',')return values;
 }
 return values;
}
