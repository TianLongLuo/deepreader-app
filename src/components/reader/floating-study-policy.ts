export type DismissReason='outside'|'escape'|'scroll'|'turn'|'book-change';
export function shouldDismiss(reason:DismissReason,pinned:boolean){return reason==='book-change'||reason==='escape'||!pinned;}
export function isAnchorOffscreen(anchor:{left:number;right:number;top:number;bottom:number}|undefined,width:number,height:number){return !anchor||anchor.bottom<0||anchor.top>height||anchor.right<0||anchor.left>width;}
