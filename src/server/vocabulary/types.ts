export type LearningScope={userId:string;workspaceId:string};
export type SourceLanguage='en'|'es';
export type MeaningLanguage='en'|'zh';
export type ContextMeaning={en?:string;zh?:string};
export type SavedEvidence={rawNote:string;context:string;targetSentence:string;phonetic:string;sourceLanguage:SourceLanguage;meaning:ContextMeaning;legacyContextMeaning:string;dictionary:unknown;legacyReviewAt:Date|null;legacyReviewCount:number};
export type ReviewFront={sessionId:string;cardId:string;version:number;word:string;sentence:string;sourceLanguage:SourceLanguage;remaining:number};
export type ReviewBack={meaning:string;collocation:string|null};
