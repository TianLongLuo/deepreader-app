import { NextResponse } from 'next/server';
import { logoutUser } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    await logoutUser();
    
    const cookieStore = await cookies();
    cookieStore.delete('session_token');

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
