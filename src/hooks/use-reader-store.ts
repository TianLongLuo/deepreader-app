import { getStudyLanguage, type StudyLanguage } from '@/components/reader/study-interaction';
import { create } from 'zustand';
import { persist,createJSONStorage } from 'zustand/middleware';

type ReaderState = {
  studyPinned:boolean;
  setStudyPinned:(value:boolean)=>void;
  studyLanguages: Partial<Record<'en'|'es', StudyLanguage>>;
  setStudyLanguage: (mode:StudyLanguage)=>void;
  sourceLanguage: 'en' | 'es';
  setSourceLanguage: (sourceLanguage: 'en' | 'es') => void;
  fontSize: number;
  lineHeight: number;
  setTypography: (fontSize: number, lineHeight: number) => void;
  readingLevel: 'beginner' | 'intermediate' | 'advanced';
  setReadingLevel: (readingLevel: 'beginner' | 'intermediate' | 'advanced') => void;
  theme: 'light' | 'dark' | 'sepia';
  setTheme: (theme: 'light' | 'dark' | 'sepia') => void;
  learningDepth: 'quick' | 'structure' | 'grammar';
  setLearningDepth: (learningDepth: 'quick' | 'structure' | 'grammar') => void;
  bilingualMode: boolean;
  setBilingualMode: (v: boolean) => void;
  grammarMode: boolean;
  setGrammarMode: (v: boolean) => void;
  explanationLanguage: string;
  setExplanationLanguage: (lang: string) => void;
  explanationPanelWidth: number;
  explanationPanelHeight: number;
  setExplanationPanelSize: (size: {
    width: number;
    height: number;
  }) => void;
  sidebarCustomized:boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
};

export const useReaderStore = create<ReaderState>()(
  persist(
    (set, get) => ({
      studyPinned:false,
      setStudyPinned:studyPinned=>set({studyPinned}),
      studyLanguages: {},
      setStudyLanguage: (mode) => {const source=get().sourceLanguage; const valid=getStudyLanguage(source,{[source]:mode});set({studyLanguages:{...get().studyLanguages,[source]:valid},explanationLanguage:valid==='es'?'Spanish':valid==='bilingual'?'Chinese':'English',bilingualMode:valid==='bilingual'});},
      sourceLanguage: 'en',
      setSourceLanguage: (sourceLanguage) => {const mode=getStudyLanguage(sourceLanguage,get().studyLanguages);set({sourceLanguage,explanationLanguage:mode==='es'?'Spanish':mode==='bilingual'?'Chinese':'English',bilingualMode:mode==='bilingual'});},
      fontSize: 18,
      lineHeight: 1.8,
      setTypography: (fontSize, lineHeight) => set({fontSize, lineHeight}),
      readingLevel: 'intermediate',
      setReadingLevel: (readingLevel) => set({readingLevel}),
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      learningDepth: 'quick',
      setLearningDepth: (learningDepth) => set({ learningDepth }),
      bilingualMode: false,
      setBilingualMode: (bilingualMode) => set({ bilingualMode }),
      grammarMode: true,
      setGrammarMode: (grammarMode) => set({ grammarMode }),
      explanationLanguage: 'English',
      setExplanationLanguage: (explanationLanguage) => set({ explanationLanguage }),
      explanationPanelWidth: 620,
      explanationPanelHeight: 760,
      setExplanationPanelSize: ({ width, height }) =>
        set({
          explanationPanelWidth: width,
          explanationPanelHeight: height,
        }),
      sidebarCustomized:false,
      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed,sidebarCustomized:true }),
    }),
    {
      name: 'reader-preferences',
      storage:createJSONStorage(()=>({getItem:key=>{try{return localStorage.getItem(key);}catch{return null;}},setItem:(key,value)=>{try{localStorage.setItem(key,value);}catch{}},removeItem:key=>{try{localStorage.removeItem(key);}catch{}}})),
    }
  )
);
