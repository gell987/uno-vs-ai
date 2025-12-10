// app/api/game/uno/route.js
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/utils';
import { callUno } from '@/lib/game-engine';

export async function POST(request) {
  try {
    const { userId, error } = await getAuthUser(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: error || 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    
    const body = await request.json();
    const { gameId } = body;
    
    if (!gameId) {
      return NextResponse.json({ success: false, error: 'Game ID required', code: 'MISSING_PARAMS' }, { status: 400 });
    }
    
    const result = await callUno(gameId, userId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error, code: 'UNO_FAILED' }, { status: 400 });
    }
    
    return NextResponse.json({ success: true, data: { called: true } });
    
  } catch (error) {
    console.error('Call UNO error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
