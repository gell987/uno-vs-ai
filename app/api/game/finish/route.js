// app/api/game/finish/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS, ANTI_ABUSE } from '@/lib/redis';
import { getAuthUser, checkRateLimit, analyzeGamePatterns, updateAntiAbuseScore } from '@/lib/utils';
import { getGameState, finishGame } from '@/lib/game-engine';

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
    
    // CRITICAL: Rate limiting for finish-game (anti-coin farming)
    // Only 3 finished games per minute allowed
    const rateLimit = await checkRateLimit(userId, 'finish_game', ANTI_ABUSE.MAX_GAMES_PER_MINUTE, 60);
    if (!rateLimit.allowed) {
      // This is VERY suspicious - might be farming
      await updateAntiAbuseScore(userId, 15);
      
      return NextResponse.json({
        success: false,
        error: 'Too many game completions. Suspicious activity detected.',
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
    
    // Get game state
    const gameState = await getGameState(gameId);
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
    
    // Verify game is actually finished
    if (gameState.status !== 'finished') {
      return NextResponse.json({
        success: false,
        error: 'Game is not finished',
        code: 'GAME_NOT_FINISHED',
      }, { status: 400 });
    }
    
    // Anti-abuse: Check game duration
    const duration = (gameState.finishedAt - gameState.createdAt) / 1000;
    if (duration < ANTI_ABUSE.MIN_GAME_DURATION_SECONDS) {
      // Suspiciously fast game
      await updateAntiAbuseScore(userId, 10);
      
      // Still process but don't award streak bonus
      const result = await finishGame(gameId, userId);
      
      // Zero out the streak if suspicious
      if (result.streakUpdated) {
        await redis.hset(KEYS.user(userId), { s: 0 });
        await redis.zadd(KEYS.leaderboardStreaks, { score: 0, member: userId });
      }
      
      return NextResponse.json({
        success: true,
        data: {
          coinsAwarded: result.coinsAwarded,
          streakUpdated: false,
          newStreak: 0,
          warning: 'Game completed too quickly. Streak not counted.',
        },
      });
    }
    
    // Anti-abuse: Check move count
    const minExpectedMoves = 7;
    if (gameState.moveCount < minExpectedMoves && gameState.winner === playerIndex) {
      // Won too easily - suspicious
      await updateAntiAbuseScore(userId, 8);
    }
    
    // Process the game finish
    const result = await finishGame(gameId, userId);
    
    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        code: 'FINISH_FAILED',
      }, { status: 400 });
    }
    
    // Post-game pattern analysis
    const patterns = await analyzeGamePatterns(userId);
    if (patterns.suspicious) {
      await updateAntiAbuseScore(userId, Math.floor(patterns.score / 2));
      
      // If severely suspicious, invalidate this game's rewards
      if (patterns.score >= ANTI_ABUSE.SUSPICIOUS_SCORE_THRESHOLD) {
        // Revert coins
        if (result.coinsAwarded && result.coinsAwarded > 0) {
          await redis.hincrby(KEYS.user(userId), 'c', -result.coinsAwarded);
        }
        
        // Revert streak
        if (result.streakUpdated) {
          await redis.hset(KEYS.user(userId), { s: 0 });
          await redis.zadd(KEYS.leaderboardStreaks, { score: 0, member: userId });
        }
        
        return NextResponse.json({
          success: true,
          data: {
            coinsAwarded: 0,
            streakUpdated: false,
            newStreak: 0,
            warning: 'Rewards withheld due to suspicious activity patterns.',
          },
        });
      }
    }
    
    // Normal success
    return NextResponse.json({
      success: true,
      data: {
        coinsAwarded: result.coinsAwarded,
        streakUpdated: result.streakUpdated,
        newStreak: result.newStreak,
      },
    });
    
  } catch (error) {
    console.error('Finish game error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}
