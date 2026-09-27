import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';

export class AuthRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function parseCredentials(value: unknown, signup = false) {
  if (!value || typeof value !== 'object') throw new AuthRequestError('Invalid credentials', 400);
  const body = value as Record<string, unknown>;
  if (typeof body.email !== 'string' || typeof body.password !== 'string') throw new AuthRequestError('Account and password required', 400);
  const email = signup ? body.email.trim().toLowerCase() : body.email.trim();
  const password = body.password;
  if (!email || email.length > 254 || !password.length || (signup && (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72))) throw new AuthRequestError('Password must be at least 8 characters and at most 72 bytes', 400);
  if (signup && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthRequestError('Valid email required', 400);
  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 80)) throw new AuthRequestError('Invalid name', 400);
  return { email, password, name: typeof body.name === 'string' ? body.name.trim() : undefined };
}

export function assertSameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return;
  // Behind a reverse proxy, standard Request.url reflects the internal
  // server address (e.g. localhost:3000), not the public origin. Build the
  // expected origin from the forwarded headers instead.
  const fwdHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const fwdProto = req.headers.get('x-forwarded-proto') || 'http';
  const expectedOrigin = `${fwdProto}://${fwdHost}`;
  if (origin !== expectedOrigin || req.headers.get('sec-fetch-site') === 'cross-site') throw new AuthRequestError('Invalid request origin', 403);
}

export async function checkAuthRequest(req: Request, action: 'login' | 'signup', identifier: string) {
  assertSameOrigin(req);
  identifier=identifier.trim().toLowerCase();

  const now = Date.now();
  // Expired counters contain only one-way identifiers, never passwords or raw IPs.
  await prisma.authAttempt.deleteMany({where:{expiresAt:{lte:new Date(now)}}});
  const address = (process.env.AUTH_TRUST_PROXY==='true'?req.headers.get('x-real-ip'):null)||'unknown';
  const adminName = (process.env.ADMIN_LOGIN_NAME || 'Lone').toLowerCase();
  const account = identifier === adminName ? (process.env.ADMIN_EMAIL || adminName).toLowerCase() : identifier;
  const limits = action === 'signup' ? [[`signup:ip:${address}`, 5, 3600000]] as const
    : [[`login:ip:${address}`, 30, 900000], [`login:account:${account}`, 10, 900000]] as const;
  for (const [key, max, window] of limits) {
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const row=await prisma.authAttempt.upsert({where:{key:hash},create:{key:hash,attempts:1,expiresAt:new Date(now+window)},update:{attempts:{increment:1}}});
    if (!row || row.attempts > max) throw new AuthRequestError('Too many attempts. Please try again later.', 429);
  }
}
