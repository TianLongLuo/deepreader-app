export class VocabularyError extends Error{constructor(message:string,public status:number){super(message);}}
export const activeDocument={status:{notIn:['DELETED','DELETING']}};
