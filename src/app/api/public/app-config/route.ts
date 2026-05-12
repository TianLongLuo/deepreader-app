import { NextResponse } from 'next/server';
import { appConfigService } from '@/server/app-config/app-config.service';

export async function GET() {
  const config = await appConfigService.getPublicConfig();
  return NextResponse.json(config);
}
