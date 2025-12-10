// app/api/game/join/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS } from '@/lib/redis';
import { getAuthUser } from '@/lib/utils';
import { getGameState, getPlayerHand, getCardById } from '@/lib/game-engine';

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
    
    // For now, just return game state (multiplayer join can be expanded later)
    const gameState = await getGameState(gameId);
    if (!gameState) {
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
          players: gameState.players.map(p => ({ name: p.name, type: p.type, handSize: p.handSize })),
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
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
