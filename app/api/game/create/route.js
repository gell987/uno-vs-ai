// app/api/game/create/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS, ANTI_ABUSE } from '@/lib/redis';
import { getAuthUser, checkRateLimit, analyzeGamePatterns, updateAntiAbuseScore } from '@/lib/utils';
import { createGame, getPlayerHand, getCardById } from '@/lib/game-engine';

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

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
    
    // Rate limiting: max 3 games created per minute
    const rateLimit = await checkRateLimit(userId, 'create_game', 3, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({
        success: false,
        error: `Rate limited. Try again in ${rateLimit.resetIn} seconds.`,
        code: 'RATE_LIMITED',
      }, { status: 429 });
    }
    
    // Check if user is banned or restricted
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
        error: 'Account suspended due to suspicious activity',
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
    
    // Parse and validate request
    const body = await request.json();
    const { difficulty, vsBot = false } = body;
    
    if (!VALID_DIFFICULTIES.includes(difficulty)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid difficulty. Must be easy, medium, or hard.',
        code: 'INVALID_DIFFICULTY',
      }, { status: 400 });
    }
    
    // Check for suspicious patterns before creating game
    const patterns = await analyzeGamePatterns(userId);
    if (patterns.suspicious) {
      await updateAntiAbuseScore(userId, patterns.score);
      
      if (patterns.score >= 40) {
        return NextResponse.json({
          success: false,
          error: 'Suspicious activity detected. Please try again later.',
          code: 'SUSPICIOUS_ACTIVITY',
        }, { status: 429 });
      }
    }
    
    // Create the game
    const userName = userData.n;
    const gameState = await createGame(userId, userName, difficulty, vsBot);
    
    // Get player's hand for response
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
            isCurrentTurn: gameState.players[gameState.currentPlayerIndex].oderId === p.oderId,
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
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}
