// app/api/leaderboard/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS } from '@/lib/redis';
import { getAuthUser, checkRateLimit, getClientInfo, hashIP } from '@/lib/utils';

export async function GET(request) {
  try {
    const { ip } = getClientInfo(request);
    const rateLimit = await checkRateLimit(hashIP(ip), 'leaderboard', 30, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Rate limited', code: 'RATE_LIMITED' }, { status: 429 });
    }
    
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'wins';
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);
    const offset = parseInt(searchParams.get('offset') || '0');
    
    const keyMap = { wins: KEYS.leaderboardWins, streaks: KEYS.leaderboardStreaks, coins: KEYS.leaderboardCoins };
    const key = keyMap[type] || keyMap.wins;
    
    const results = await redis.zrange(key, offset, offset + limit - 1, { rev: true, withScores: true }) || [];
    
    const entries = [];
    for (let i = 0; i < results.length; i += 2) {
      const oderId = results[i];
      const score = results[i + 1];
      const userData = await redis.hgetall(KEYS.user(oderId));
      entries.push({ rank: offset + (i / 2) + 1, oderId, name: userData?.n || 'Unknown', value: score });
    }
    
    return NextResponse.json({ success: true, data: { type, entries, offset, limit } });
    
  } catch (error) {
    console.error('Leaderboard error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { userId, error } = await getAuthUser(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: error || 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    
    const winsRank = await redis.zrevrank(KEYS.leaderboardWins, userId);
    const streaksRank = await redis.zrevrank(KEYS.leaderboardStreaks, userId);
    const coinsRank = await redis.zrevrank(KEYS.leaderboardCoins, userId);
    
    const winsScore = await redis.zscore(KEYS.leaderboardWins, userId);
    const streaksScore = await redis.zscore(KEYS.leaderboardStreaks, userId);
    const coinsScore = await redis.zscore(KEYS.leaderboardCoins, userId);
    
    return NextResponse.json({
      success: true,
      data: {
        wins: { rank: winsRank !== null ? winsRank + 1 : null, value: winsScore || 0 },
        streaks: { rank: streaksRank !== null ? streaksRank + 1 : null, value: streaksScore || 0 },
        coins: { rank: coinsRank !== null ? coinsRank + 1 : null, value: coinsScore || 0 },
      },
    });
    
  } catch (error) {
    console.error('My ranks error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
