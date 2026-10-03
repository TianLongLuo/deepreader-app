'use client';

import { useState, useEffect } from 'react';

/**
 * Hook to persist form draft state.
 * Syncs unsaved structured data into localStorage safely.
 */
export function useDraft<T>(key: string, initialValue: T, sanitizeStoredValue?: (value: T) => T) {
  const [draft, setDraft] = useState<T>(initialValue);
  const [hasDraft, setHasDraft] = useState<boolean>(false);

  // Load from local storage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`draft:${key}`);
      if (stored) {
        const parsed = JSON.parse(stored) as T;
        const restored = sanitizeStoredValue ? sanitizeStoredValue(parsed) : parsed;
        // Browser-only hydration keeps the server/first client render identical.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDraft(restored);
        setHasDraft(true);
        // Scrub any older persisted secrets before this draft is used again.
        const sanitized = JSON.stringify(restored);
        if (sanitizeStoredValue && sanitized !== stored) localStorage.setItem(`draft:${key}`, sanitized);
      }
    } catch {
      // Ignore parse errors
    }
  }, [key, sanitizeStoredValue]);

  // Update both state and local storage
  const updateDraft = (newVal: T) => {
    setDraft(newVal);
    setHasDraft(true);
    try {
      localStorage.setItem(`draft:${key}`, JSON.stringify(sanitizeStoredValue ? sanitizeStoredValue(newVal) : newVal));
    } catch { /* A blocked browser store must not prevent in-memory editing. */ }
  };

  // Clear draft
  const discardDraft = () => {
    setDraft(initialValue);
    setHasDraft(false);
    try { localStorage.removeItem(`draft:${key}`); } catch {}
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
