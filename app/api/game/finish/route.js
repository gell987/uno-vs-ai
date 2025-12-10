// app/api/game/finish/route.js
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/utils';
import { finishGame, getGameState } from '@/lib/game-engine';

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
    
    const gameState = await getGameState(gameId);
    if (!gameState) {
      return NextResponse.json({ success: false, error: 'Game not found', code: 'GAME_NOT_FOUND' }, { status: 404 });
    }
    
    if (gameState.status !== 'finished') {
      return NextResponse.json({ success: false, error: 'Game not finished', code: 'GAME_NOT_FINISHED' }, { status: 400 });
    }
    
    const result = await finishGame(gameId, userId);
    
    return NextResponse.json({
      success: true,
      data: { coinsAwarded: result.coinsAwarded, streakUpdated: result.streakUpdated, newStreak: result.newStreak },
    });
    
  } catch (error) {
    console.error('Finish game error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
