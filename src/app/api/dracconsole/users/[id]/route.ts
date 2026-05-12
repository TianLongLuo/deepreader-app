import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { dracConsoleService } from '@/server/admin/dracconsole.service';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const resolvedParams = await params;

    await dracConsoleService.deleteUser(resolvedParams.id, admin.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 403 }
    );
  }
}
