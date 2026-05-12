/**
 * This is an entry point file to run workers standalone.
 * For production, you'd run `npx tsx src/workers/index.ts`
 */

import { parseWorker } from './parse.worker';

// Keep the process alive
process.on('SIGINT', async () => {
    console.log('Shutting down workers...');
    await parseWorker.close();
    process.exit(0);
});

console.log('Workers started successfully.');
