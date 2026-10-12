import { NextResponse } from 'next/server';
import { endSession } from '@/lib/auth/login';

export async function POST() {
  await endSession();
  return NextResponse.json({ ok: true });
}
