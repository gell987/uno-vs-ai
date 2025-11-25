// app/api/game/uno/route.js
import { NextResponse } from 'next/server';
import { getAuthUser, checkRateLimit } from '@/lib/utils';
import { callUno, getGameState } from '@/lib/game-engine';

export async function POST(request) {
  try {
    const { userId, error } = await getAuthUser(request);
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: error || 'Unauthorized',
        code: 'UNAUTHORIZED',
      }, { status: 401 });
    }
    
    // Rate limiting
    const rateLimit = await checkRateLimit(userId, 'call_uno', 10, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMITED',
      }, { status: 429 });
    }
    
    const body = await request.json();
    const { gameId } = body;
    
    if (!gameId) {
      return NextResponse.json({
        success: false,
        error: 'Game ID required',
        code: 'MISSING_GAME_ID',
      }, { status: 400 });
    }
    
    // Verify game exists
    const gameState = await getGameState(gameId);
    if (!gameState) {
      return NextResponse.json({
        success: false,
        error: 'Game not found',
        code: 'GAME_NOT_FOUND',
      }, { status: 404 });
    }
    
    // Call UNO
    const result = await callUno(gameId, userId);
    
    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        code: 'UNO_FAILED',
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: true,
      data: { unoCalled: true },
    });
    
  } catch (error) {
    console.error('UNO call error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}
