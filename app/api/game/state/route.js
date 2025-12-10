// app/api/game/state/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS } from '@/lib/redis';
import { getAuthUser } from '@/lib/utils';
import { getGameState, getPlayerHand, getCardById, clearActiveGame } from '@/lib/game-engine';

export async function GET(request) {
  try {
    const { userId, error } = await getAuthUser(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: error || 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    let gameId = searchParams.get('gameId');
    
    if (!gameId) {
      gameId = await redis.get(KEYS.userActiveGame(userId));
      if (!gameId) {
        return NextResponse.json({ success: false, error: 'No active game', code: 'NO_ACTIVE_GAME' }, { status: 404 });
      }
    }
    
    const gameState = await getGameState(gameId);
    if (!gameState) {
      await clearActiveGame(userId);
      return NextResponse.json({ success: false, error: 'Game not found', code: 'GAME_NOT_FOUND' }, { status: 404 });
    }
    
    const playerIndex = gameState.players.findIndex(p => p.oderId === userId);
    if (playerIndex === -1) {
      return NextResponse.json({ success: false, error: 'Not in game', code: 'NOT_IN_GAME' }, { status: 403 });
    }
    
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
          players: gameState.players.map(p => ({ name: p.name, type: p.type, handSize: p.handSize, calledUno: p.calledUno })),
          currentPlayerIndex: gameState.currentPlayerIndex,
          discardTop: topCard,
          currentColor: gameState.discardColor,
          drawPending: gameState.drawPending,
          deckSize: gameState.deckIds.length,
          winner: gameState.winner,
        },
        hand: handCards,
        playerIndex,
        isYourTurn: gameState.currentPlayerIndex === playerIndex,
      },
    });
    
  } catch (error) {
    console.error('Game state error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { userId, error } = await getAuthUser(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: error || 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    
    const body = await request.json();
    const { gameId, action } = body;
    
    if (action !== 'leave') {
      return NextResponse.json({ success: false, error: 'Invalid action', code: 'INVALID_ACTION' }, { status: 400 });
    }
    
    const activeGameId = gameId || await redis.get(KEYS.userActiveGame(userId));
    
    // Always clear active game
    await clearActiveGame(userId);
    
    if (activeGameId) {
      const gameState = await getGameState(activeGameId);
      if (gameState && gameState.status === 'playing') {
        const playerIndex = gameState.players.findIndex(p => p.oderId === userId);
        if (playerIndex !== -1) {
          await redis.hincrby(KEYS.user(userId), 'l', 1);
          const opponent = gameState.players[(playerIndex + 1) % 2];
          if (opponent && opponent.type === 'human') {
            await redis.hset(KEYS.user(userId), { s: 0 });
          }
        }
      }
    }
    
    return NextResponse.json({ success: true, data: { left: true } });
    
  } catch (error) {
    console.error('Leave game error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
