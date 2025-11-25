// app/api/game/state/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS } from '@/lib/redis';
import { getAuthUser, checkRateLimit } from '@/lib/utils';
import { getGameState, getPlayerHand, getCardById } from '@/lib/game-engine';

// GET - Get current game state
export async function GET(request) {
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
    const rateLimit = await checkRateLimit(userId, 'game_state', 60, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMITED',
      }, { status: 429 });
    }
    
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('gameId');
    
    // If no gameId provided, try to get user's active game
    let targetGameId = gameId;
    if (!targetGameId) {
      targetGameId = await redis.get(KEYS.userActiveGame(userId));
      if (!targetGameId) {
        return NextResponse.json({
          success: false,
          error: 'No active game found',
          code: 'NO_ACTIVE_GAME',
        }, { status: 404 });
      }
    }
    
    // Get game state
    const gameState = await getGameState(targetGameId);
    if (!gameState) {
      return NextResponse.json({
        success: false,
        error: 'Game not found',
        code: 'GAME_NOT_FOUND',
      }, { status: 404 });
    }
    
    // Verify user is in the game
    const playerIndex = gameState.players.findIndex(p => p.oderId === userId);
    if (playerIndex === -1) {
      return NextResponse.json({
        success: false,
        error: 'You are not in this game',
        code: 'NOT_IN_GAME',
      }, { status: 403 });
    }
    
    // Get player's hand
    const hand = await getPlayerHand(targetGameId, playerIndex);
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
            isCurrentTurn: gameState.players[gameState.currentPlayerIndex]?.oderId === p.oderId,
            calledUno: p.calledUno,
          })),
          currentPlayerIndex: gameState.currentPlayerIndex,
          discardTop: topCard,
          currentColor: gameState.discardColor,
          drawPending: gameState.drawPending,
          deckSize: gameState.deckIds.length,
          winner: gameState.winner,
          moveCount: gameState.moveCount,
        },
        hand: handCards,
        playerIndex,
        isYourTurn: gameState.currentPlayerIndex === playerIndex,
      },
    });
    
  } catch (error) {
    console.error('Game state error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}

// POST - Leave/abandon current game
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
    
    const body = await request.json();
    const { gameId, action } = body;
    
    if (action !== 'leave') {
      return NextResponse.json({
        success: false,
        error: 'Invalid action',
        code: 'INVALID_ACTION',
      }, { status: 400 });
    }
    
    // Get active game
    const activeGameId = gameId || await redis.get(KEYS.userActiveGame(userId));
    if (!activeGameId) {
      return NextResponse.json({
        success: false,
        error: 'No active game',
        code: 'NO_ACTIVE_GAME',
      }, { status: 404 });
    }
    
    // Just remove user from active game tracking
    // The game will auto-expire after 30 minutes
    await redis.del(KEYS.userActiveGame(userId));
    
    // Record as a loss if game was in progress
    const gameState = await getGameState(activeGameId);
    if (gameState && gameState.status === 'playing') {
      const playerIndex = gameState.players.findIndex(p => p.oderId === userId);
      if (playerIndex !== -1) {
        // Increment losses
        await redis.hincrby(KEYS.user(userId), 'l', 1);
        
        // Reset streak if vs human
        const opponent = gameState.players[(playerIndex + 1) % 2];
        if (opponent && opponent.type === 'human') {
          await redis.hset(KEYS.user(userId), { s: 0 });
          await redis.zadd(KEYS.leaderboardStreaks, { score: 0, member: userId });
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      data: { left: true },
    });
    
  } catch (error) {
    console.error('Leave game error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}
