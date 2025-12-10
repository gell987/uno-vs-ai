// app/api/game/create/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS, ANTI_ABUSE } from '@/lib/redis';
import { getAuthUser, checkRateLimit } from '@/lib/utils';
import { createGame, getPlayerHand, getCardById, checkAndCleanupActiveGame } from '@/lib/game-engine';

export async function POST(request) {
  try {
    const { userId, error } = await getAuthUser(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: error || 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    
    const rateLimit = await checkRateLimit(userId, 'create_game', 5, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: `Rate limited. Try again in ${rateLimit.resetIn}s`, code: 'RATE_LIMITED' }, { status: 429 });
    }
    
    const userData = await redis.hgetall(KEYS.user(userId));
    if (!userData) {
      return NextResponse.json({ success: false, error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 });
    }
    
    const antiAbuseScore = parseInt(userData.aa || '0');
    if (antiAbuseScore >= ANTI_ABUSE.BAN_SCORE_THRESHOLD) {
      return NextResponse.json({ success: false, error: 'Account suspended', code: 'ACCOUNT_SUSPENDED' }, { status: 403 });
    }
    
    // Check and cleanup stale active games
    const activeGame = await checkAndCleanupActiveGame(userId);
    if (activeGame) {
      return NextResponse.json({ 
        success: false, 
        error: 'You are already in a game', 
        code: 'ALREADY_IN_GAME',
        data: { gameId: activeGame }
      }, { status: 409 });
    }
    
    const body = await request.json();
    const { difficulty = 'medium', vsBot = true } = body;
    
    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      return NextResponse.json({ success: false, error: 'Invalid difficulty', code: 'INVALID_DIFFICULTY' }, { status: 400 });
    }
    
    const gameState = await createGame(userId, userData.n, difficulty, vsBot);
    const hand = await getPlayerHand(gameState.id, 0);
    const handCards = hand.map(id => getCardById(id));
    const topCard = getCardById(gameState.discardTopId);
    
    return NextResponse.json({
      success: true,
      data: {
        game: {
          id: gameState.id,
          status: gameState.status,
          difficulty: gameState.difficulty,
          players: gameState.players.map(p => ({
            name: p.name,
            type: p.type,
            handSize: p.handSize,
          })),
          currentPlayerIndex: gameState.currentPlayerIndex,
          discardTop: topCard,
          currentColor: gameState.discardColor,
          drawPending: gameState.drawPending,
          deckSize: gameState.deckIds.length,
        },
        hand: handCards,
      },
    });
    
  } catch (error) {
    console.error('Create game error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
