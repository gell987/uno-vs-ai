// app/api/game/draw/route.js
import { NextResponse } from 'next/server';
import { getAuthUser, checkRateLimit } from '@/lib/utils';
import { 
  drawCard, getPlayerHand, getCardById, getGameState,
  executeBotTurn, finishGame 
} from '@/lib/game-engine';

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
    const rateLimit = await checkRateLimit(userId, 'draw_card', 30, 60);
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
    
    // Verify game exists and user is in it
    const gameState = await getGameState(gameId);
    if (!gameState) {
      return NextResponse.json({
        success: false,
        error: 'Game not found',
        code: 'GAME_NOT_FOUND',
      }, { status: 404 });
    }
    
    const playerIndex = gameState.players.findIndex(p => p.oderId === userId);
    if (playerIndex === -1) {
      return NextResponse.json({
        success: false,
        error: 'You are not in this game',
        code: 'NOT_IN_GAME',
      }, { status: 403 });
    }
    
    // Draw card(s)
    const result = await drawCard(gameId, userId);
    
    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        code: 'DRAW_FAILED',
      }, { status: 400 });
    }
    
    let updatedGame = result.gameState;
    
    // Check if it's now the bot's turn
    let botMoved = false;
    
    if (
      updatedGame.status === 'playing' &&
      updatedGame.players[updatedGame.currentPlayerIndex].type === 'bot'
    ) {
      await new Promise(resolve => setTimeout(resolve, 800));
      const botResult = await executeBotTurn(gameId);
      botMoved = true;
      
      if (botResult.gameEnded) {
        await finishGame(gameId, userId);
      }
      
      updatedGame = await getGameState(gameId);
    }
    
    const hand = await getPlayerHand(gameId, playerIndex);
    const handCards = hand.map(id => getCardById(id));
    const topCard = getCardById(updatedGame.discardTopId);
    
    return NextResponse.json({
      success: true,
      data: {
        game: {
          id: updatedGame.id,
          status: updatedGame.status,
          difficulty: updatedGame.difficulty,
          players: updatedGame.players.map(p => ({
            name: p.name,
            type: p.type,
            handSize: p.handSize,
            isCurrentTurn: updatedGame.players[updatedGame.currentPlayerIndex]?.oderId === p.oderId,
          })),
          currentPlayerIndex: updatedGame.currentPlayerIndex,
          discardTop: topCard,
          currentColor: updatedGame.discardColor,
          drawPending: updatedGame.drawPending,
          deckSize: updatedGame.deckIds.length,
          winner: updatedGame.winner,
        },
        hand: handCards,
        drawnCards: result.drawnCards,
        mustDraw: result.mustDraw,
        botMoved,
        gameEnded: updatedGame.status === 'finished',
        youWon: updatedGame.winner === playerIndex,
      },
    });
    
  } catch (error) {
    console.error('Draw error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}
