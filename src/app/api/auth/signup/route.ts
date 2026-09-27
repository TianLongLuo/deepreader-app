import { AuthRequestError, checkAuthRequest, parseCredentials } from '@/lib/auth-guard';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE_MAX_AGE_SECONDS, registerUser, loginUser } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { email, password, name } = parseCredentials(await req.json(), true);
    await checkAuthRequest(req, 'signup', email);

    // Register
    await registerUser(email, password, name);

    // Auto login
    const { user, token } = await loginUser(email, password);

    const cookieStore = await cookies();
    cookieStore.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
      path: '/'
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: error instanceof AuthRequestError ? error.status : 400 });
  }
}
