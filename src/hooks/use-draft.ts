'use client';

import { useState, useEffect } from 'react';

/**
 * Hook to persist form draft state.
 * Syncs unsaved structured data into localStorage safely.
 */
export function useDraft<T>(key: string, initialValue: T) {
  const [draft, setDraft] = useState<T>(initialValue);
  const [hasDraft, setHasDraft] = useState<boolean>(false);

  // Load from local storage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`draft:${key}`);
      if (stored) {
        setDraft(JSON.parse(stored));
        setHasDraft(true);
      }
    } catch (e) {
      // Ignore parse errors
    }
  }, [key]);

  // Update both state and local storage
  const updateDraft = (newVal: T) => {
    setDraft(newVal);
    setHasDraft(true);
    localStorage.setItem(`draft:${key}`, JSON.stringify(newVal));
  };

  // Clear draft
  const discardDraft = () => {
    setDraft(initialValue);
    setHasDraft(false);
    localStorage.removeItem(`draft:${key}`);
  };

  // Check if draft exists without loading it via state to avoid hydration issues
  const checkDraftExists = () => {
      return localStorage.getItem(`draft:${key}`) !== null;
  }

  return {
    draft,
    hasDraft,
    updateDraft,
    discardDraft,
    checkDraftExists
  };
}
