export function awaitWithSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("Cancelled", "AbortError"));
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export async function abortableDelay(ms: number, signal?: AbortSignal) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await awaitWithSignal(
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
      signal,
    );
  } finally {
    clearTimeout(timer);
  }
}

type Flight = {
  controller: AbortController;
  subscribers: number;
  promise: Promise<unknown>;
};
const flights = new Map<string, Flight>();

/** Cancellation is subscriber-scoped; only the last departure cancels upstream. */
export async function sharedRequest<T>(
  key: string,
  signal: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  signal?.throwIfAborted();
  let flight = flights.get(key);
  if (!flight) {
    if (flights.size >= 128) throw new Error("请求繁忙，请稍后重试");
    const controller = new AbortController();
    const entry: Flight = {
      controller,
      subscribers: 0,
      promise: Promise.resolve(),
    };
    entry.promise = Promise.resolve()
      .then(() => run(controller.signal))
      .finally(() => {
        if (flights.get(key) === entry) flights.delete(key);
      });
    flights.set(key, entry);
    flight = entry;
  }
  flight.subscribers++;
  try {
    return await awaitWithSignal(flight.promise as Promise<T>, signal);
  } finally {
    if (--flight.subscribers === 0) {
      flight.controller.abort();
      if (flights.get(key) === flight) flights.delete(key);
    }
  }
}
