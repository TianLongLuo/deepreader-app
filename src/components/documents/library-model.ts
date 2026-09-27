export function filterLibrary<T extends {title:string}>(items:T[],query:string):T[]{const key=query.normalize('NFC').trim().toLocaleLowerCase();return items.filter(i=>i.title.normalize('NFC').toLocaleLowerCase().includes(key));}
export function libraryEmptyKind(total:number,visible:number){return total===0?'empty':visible===0?'filtered':null;}
