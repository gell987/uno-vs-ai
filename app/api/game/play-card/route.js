// app/api/game/play-card/route.js
import { NextResponse } from 'next/server';
import { COLORS } from '@/lib/redis';
import { getAuthUser, checkRateLimit } from '@/lib/utils';
import { playCard, getPlayerHand, getCardById, getGameState, executeBotTurn, finishGame } from '@/lib/game-engine';

export async function POST(request) {
  try {
    const { userId, error } = await getAuthUser(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: error || 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    
    const rateLimit = await checkRateLimit(userId, 'play_card', 30, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests', code: 'RATE_LIMITED' }, { status: 429 });
    }
    
    const body = await request.json();
    const { gameId, cardId, chosenColor } = body;
    
    if (!gameId || cardId === undefined) {
      return NextResponse.json({ success: false, error: 'Missing params', code: 'MISSING_PARAMS' }, { status: 400 });
    }
    
    if (typeof cardId !== 'number' || cardId < 0 || cardId > 107) {
      return NextResponse.json({ success: false, error: 'Invalid card ID', code: 'INVALID_CARD' }, { status: 400 });
    }
    
    if (chosenColor && !COLORS.includes(chosenColor)) {
      return NextResponse.json({ success: false, error: 'Invalid color', code: 'INVALID_COLOR' }, { status: 400 });
    }
    
    const gameState = await getGameState(gameId);
    if (!gameState) {
      return NextResponse.json({ success: false, error: 'Game not found', code: 'GAME_NOT_FOUND' }, { status: 404 });
    }
    
    const playerIndex = gameState.players.findIndex(p => p.oderId === userId);
    if (playerIndex === -1) {
      return NextResponse.json({ success: false, error: 'Not in game', code: 'NOT_IN_GAME' }, { status: 403 });
    }
    
    const result = await playCard(gameId, userId, cardId, chosenColor);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error, code: 'PLAY_FAILED' }, { status: 400 });
    }
    
    let updatedGame = result.gameState;
    let rewards = null;
    
    // If game ended, process finish
    if (result.gameEnded) {
      const finishResult = await finishGame(gameId, userId);
      rewards = { coinsAwarded: finishResult.coinsAwarded, newStreak: finishResult.newStreak, streakUpdated: finishResult.streakUpdated };
    }
    
    // Bot turn
    if (!result.gameEnded && updatedGame.status === 'playing' && updatedGame.players[updatedGame.currentPlayerIndex].type === 'bot') {
      await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
      const botResult = await executeBotTurn(gameId);
      
      if (botResult.gameEnded) {
        const finishResult = await finishGame(gameId, userId);
        rewards = { coinsAwarded: finishResult.coinsAwarded, newStreak: finishResult.newStreak, streakUpdated: finishResult.streakUpdated };
      }
      
      updatedGame = await getGameState(gameId) || updatedGame;
    }
    
    const hand = await getPlayerHand(gameId, playerIndex);
    const handCards = hand.map(id => getCardById(id));
    
    return NextResponse.json({
      success: true,
      data: {
        game: formatGameResponse(updatedGame),
        hand: handCards,
        penaltyApplied: result.penaltyApplied,
        gameEnded: updatedGame.status === 'finished',
        youWon: updatedGame.winner === playerIndex,
        rewards,
      },
    });
    
  } catch (error) {
    console.error('Play card error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

function formatGameResponse(game) {
  const topCard = getCardById(game.discardTopId);
  return {
    id: game.id,
    status: game.status,
    difficulty: game.difficulty,
    players: game.players.map(p => ({ name: p.name, type: p.type, handSize: p.handSize, calledUno: p.calledUno })),
    currentPlayerIndex: game.currentPlayerIndex,
    discardTop: topCard,
    currentColor: game.discardColor,
    drawPending: game.drawPending,
    deckSize: game.deckIds.length,
    winner: game.winner,
  };
}
