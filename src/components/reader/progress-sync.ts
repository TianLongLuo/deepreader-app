export type ReadingProgressSnapshot = {
  location: string;
  percentage: number;
};

function sameProgress(a: ReadingProgressSnapshot | null, b: ReadingProgressSnapshot) {
  return a?.location === b.location && a.percentage === b.percentage;
}

/** Serializes this reader's writes. It does not resolve writes from other devices. */
export function createProgressSync(
  save: (snapshot: ReadingProgressSnapshot) => Promise<unknown>,
  callbacks: { onSuccess?: () => void; onError?: (error: unknown) => void } = {},
) {
  let inFlight = false;
  let submitted: ReadingProgressSnapshot | null = null;
  let pending: ReadingProgressSnapshot | null = null;
  let lastSaved: ReadingProgressSnapshot | null = null;

  async function drain() {
    if (inFlight || !pending) return;
    const snapshot = pending;
    pending = null;
    if (sameProgress(lastSaved, snapshot)) return;
    inFlight = true;
    submitted = snapshot;
    try {
      await save(snapshot);
      lastSaved = snapshot;
      callbacks.onSuccess?.();
    } catch (error) {
      // No automatic retry loop. The next timer enqueue retries a failed snapshot.
      callbacks.onError?.(error);
    } finally {
      inFlight = false;
      submitted = null;
      if (pending) void drain();
    }
  }

  return {
    enqueue(snapshot: ReadingProgressSnapshot) {
      if (!snapshot.location) return;
      if (inFlight && sameProgress(submitted, snapshot)) {
        pending = null;
        return;
      }
      // Copy so a mutable source ref cannot change the already queued request.
      pending = { ...snapshot };
      void drain();
    },
  };
}
