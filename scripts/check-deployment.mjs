import {existsSync} from 'node:fs';
if(!/^[a-f0-9]{64}$/i.test(process.env.ENCRYPTION_KEY||''))throw Error('Set ENCRYPTION_KEY to 64 hex characters; preserve the original value when upgrading.');
if(!process.env.DATABASE_URL?.startsWith('file:'))throw Error('Set DATABASE_URL to the SQLite file URL.');
if(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD_HASH?.startsWith('$2'))throw Error('Configure ADMIN_EMAIL and a bcrypt ADMIN_PASSWORD_HASH before first deployment.');
if(!existsSync('public/dictionaries'))throw Error('Dictionary data missing');
console.log('Deployment configuration validated. Existing keys and data have not been changed.');
