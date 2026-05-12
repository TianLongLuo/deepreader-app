import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ReaderState = {
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
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
};

export const useReaderStore = create<ReaderState>()(
  persist(
    (set) => ({
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
      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
    }),
    {
      name: 'reader-preferences',
    }
  )
);
