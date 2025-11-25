// app/api/game/join/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS, ANTI_ABUSE } from '@/lib/redis';
import { getAuthUser, checkRateLimit } from '@/lib/utils';
import { joinGame, getPlayerHand, getCardById } from '@/lib/game-engine';

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
    const rateLimit = await checkRateLimit(userId, 'join_game', 5, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({
        success: false,
        error: `Rate limited. Try again in ${rateLimit.resetIn} seconds.`,
        code: 'RATE_LIMITED',
      }, { status: 429 });
    }
    
    // Check if user is banned
    const userData = await redis.hgetall(KEYS.user(userId));
    if (!userData) {
      return NextResponse.json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      }, { status: 404 });
    }
    
    const antiAbuseScore = parseInt(userData.aa || '0');
    if (antiAbuseScore >= ANTI_ABUSE.BAN_SCORE_THRESHOLD) {
      return NextResponse.json({
        success: false,
        error: 'Account suspended',
        code: 'ACCOUNT_SUSPENDED',
      }, { status: 403 });
    }
    
    // Check if user already in a game
    const activeGame = await redis.get(KEYS.userActiveGame(userId));
    if (activeGame) {
      return NextResponse.json({
        success: false,
        error: 'You are already in a game',
        code: 'ALREADY_IN_GAME',
        data: { gameId: activeGame },
      }, { status: 409 });
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
    
    // Join the game
    const userName = userData.n;
    const result = await joinGame(gameId, userId, userName);
    
    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        code: 'JOIN_FAILED',
      }, { status: 400 });
    }
    
    const gameState = result.gameState;
    
    // Find player index
    const playerIndex = gameState.players.findIndex(p => p.oderId === userId);
    
    // Get player's hand
    const hand = await getPlayerHand(gameId, playerIndex);
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
            isCurrentTurn: gameState.players[gameState.currentPlayerIndex].oderId === p.oderId,
          })),
          currentPlayerIndex: gameState.currentPlayerIndex,
          discardTop: topCard,
          currentColor: gameState.discardColor,
          drawPending: gameState.drawPending,
          deckSize: gameState.deckIds.length,
        },
        hand: handCards,
        playerIndex,
      },
    });
    
  } catch (error) {
    console.error('Join game error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}
