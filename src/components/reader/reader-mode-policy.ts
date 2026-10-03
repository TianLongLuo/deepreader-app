export function selectionMode(text:string):'word'|'paragraph'{return /^[\p{L}\p{M}'’-]+$/u.test(text.trim())?'word':'paragraph';}
export type ReadingAction='word'|'paragraph'|'flip'|'restore'|'none';
export function readingAction({flipEnabled,gesture,singleOriginalWord,oneReplacement}:{flipEnabled:boolean;gesture:'click'|'edge'|'enter'|'selection'|'alt-enter';singleOriginalWord:boolean;oneReplacement:boolean}):ReadingAction{
 if(flipEnabled){if(gesture==='click'||gesture==='alt-enter'){if(oneReplacement)return 'restore';if(singleOriginalWord)return 'flip';}return 'none';}
 if(gesture==='click'||gesture==='selection')return singleOriginalWord?'word':'paragraph';
 if(gesture==='enter'||gesture==='edge')return 'paragraph';return 'none';
}
