export function selectionMode(text:string):'word'|'paragraph'{return /^[\p{L}\p{M}'’-]+$/u.test(text.trim())?'word':'paragraph';}
