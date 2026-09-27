import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
export const dynamic='force-dynamic';
export default async function Page(){redirect((await getCurrentUser())?'/documents':'/login');}
