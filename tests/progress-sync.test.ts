import { describe, expect, it, vi } from 'vitest';
import { createProgressSync } from '@/components/reader/progress-sync';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const progress = (location: string, percentage = 10) => ({ location, percentage });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('serialized reading progress', () => {
  it('keeps one request in flight and coalesces fast page turns to the latest position', async () => {
    const first = deferred();
    const last = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
    const queue = createProgressSync(save);
    queue.enqueue(progress('A'));
    queue.enqueue(progress('B'));
    queue.enqueue(progress('C'));
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve(); await tick();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toEqual(progress('C'));
    last.resolve(); await tick();
    queue.enqueue(progress('C')); await tick();
    expect(save).toHaveBeenCalledTimes(2);
  });
  it('retries failure on the next timer enqueue without an immediate retry loop', async () => {
    const request = deferred();
    const save = vi.fn().mockReturnValueOnce(request.promise).mockResolvedValue(undefined);
    const onError = vi.fn(); const onSuccess = vi.fn();
    const queue = createProgressSync(save, { onError, onSuccess });
    queue.enqueue(progress('A')); queue.enqueue(progress('A'));
    request.reject(new Error('offline')); await tick();
    expect(save).toHaveBeenCalledTimes(1); expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    queue.enqueue(progress('A')); await tick();
    expect(save).toHaveBeenCalledTimes(2); expect(onSuccess).toHaveBeenCalledTimes(1);
  });
  it('continues with the newest pending position when an older save fails', async () => {
    const first = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const queue = createProgressSync(save);
    queue.enqueue(progress('A')); queue.enqueue(progress('B')); queue.enqueue(progress('C'));
    first.reject(new Error('timeout')); await tick();
    expect(save.mock.calls.map(call => call[0].location)).toEqual(['A','C']);
  });
  it('does not drop a return to the saved position while another write is pending', async () => {
    const second = deferred();
    const save = vi.fn().mockResolvedValueOnce(undefined).mockReturnValueOnce(second.promise).mockResolvedValue(undefined);
    const queue = createProgressSync(save);
    queue.enqueue(progress('A')); await tick();
    queue.enqueue(progress('B')); queue.enqueue(progress('A'));
    second.resolve(); await tick();
    expect(save.mock.calls.map(call => call[0].location)).toEqual(['A','B','A']);
  });
  it('captures snapshots and includes percentage changes in duplicate detection', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const queue = createProgressSync(save); const snapshot = progress('A');
    queue.enqueue(snapshot); snapshot.location = 'B'; await tick();
    expect(save.mock.calls[0][0]).toEqual(progress('A'));
    queue.enqueue(progress('A', 20)); await tick();
    expect(save).toHaveBeenCalledTimes(2);
  });
});
