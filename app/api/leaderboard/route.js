// app/api/leaderboard/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS } from '@/lib/redis';
import { checkRateLimit, getAuthUser, getClientInfo, hashIP } from '@/lib/utils';

const VALID_TYPES = ['streaks', 'wins', 'coins'];

// GET - Get leaderboard
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'wins';
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    
    // Rate limit by IP
    const { ip } = getClientInfo(request);
    const ipHash = hashIP(ip);
    
    const rateLimit = await checkRateLimit(`ip:${ipHash}`, 'leaderboard', 30, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMITED',
      }, { status: 429 });
    }
    
    // Validate type
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid leaderboard type. Must be streaks, wins, or coins.',
        code: 'INVALID_TYPE',
      }, { status: 400 });
    }
    
    // Get the appropriate leaderboard key
    const leaderboardKey = {
      streaks: KEYS.leaderboardStreaks,
      wins: KEYS.leaderboardWins,
      coins: KEYS.leaderboardCoins,
    }[type];
    
    // Get leaderboard data (descending order)
    const results = await redis.zrange(
      leaderboardKey,
      offset,
      offset + limit - 1,
      { rev: true, withScores: true }
    );
    
    // Get user names for each entry
    const entries = [];
    
    for (let i = 0; i < results.length; i += 2) {
      const oderId = results[i];
      const value = results[i + 1];
      
      // Get user name
      const userName = await redis.hget(KEYS.user(oderId), 'n');
      
      entries.push({
        rank: offset + Math.floor(i / 2) + 1,
        oderId,
        name: userName || 'Unknown',
        value: parseInt(value) || 0,
      });
    }
    
    // Get total count
    const totalCount = await redis.zcard(leaderboardKey);
    
    return NextResponse.json({
      success: true,
      data: {
        type,
        entries,
        pagination: {
          offset,
          limit,
          total: totalCount,
          hasMore: offset + limit < totalCount,
        },
      },
    });
    
  } catch (error) {
    console.error('Leaderboard error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}

// POST - Get user's own rank
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
    
    // Get ranks for all leaderboards
    const [streakRank, winsRank, coinsRank] = await Promise.all([
      redis.zrevrank(KEYS.leaderboardStreaks, userId),
      redis.zrevrank(KEYS.leaderboardWins, userId),
      redis.zrevrank(KEYS.leaderboardCoins, userId),
    ]);
    
    // Get user's scores
    const [streakScore, winsScore, coinsScore] = await Promise.all([
      redis.zscore(KEYS.leaderboardStreaks, userId),
      redis.zscore(KEYS.leaderboardWins, userId),
      redis.zscore(KEYS.leaderboardCoins, userId),
    ]);
    
    return NextResponse.json({
      success: true,
      data: {
        streaks: {
          rank: streakRank !== null ? streakRank + 1 : null,
          value: parseInt(streakScore) || 0,
        },
        wins: {
          rank: winsRank !== null ? winsRank + 1 : null,
          value: parseInt(winsScore) || 0,
        },
        coins: {
          rank: coinsRank !== null ? coinsRank + 1 : null,
          value: parseInt(coinsScore) || 0,
        },
      },
    });
    
  } catch (error) {
    console.error('User rank error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}
