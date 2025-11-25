// app/api/user/profile/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS, ANTI_ABUSE } from '@/lib/redis';
import { getAuthUser, userFromRedis, validateUsername } from '@/lib/utils';

// GET - Get user profile
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
    
    // Get user data
    const userData = await redis.hgetall(KEYS.user(userId));
    
    if (!userData || Object.keys(userData).length === 0) {
      return NextResponse.json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      }, { status: 404 });
    }
    
    const user = userFromRedis(userData);
    
    // Get leaderboard ranks
    const [streakRank, winsRank, coinsRank] = await Promise.all([
      redis.zrevrank(KEYS.leaderboardStreaks, userId),
      redis.zrevrank(KEYS.leaderboardWins, userId),
      redis.zrevrank(KEYS.leaderboardCoins, userId),
    ]);
    
    // Check if user is flagged
    const isSuspicious = user.antiAbuseScore >= ANTI_ABUSE.SUSPICIOUS_SCORE_THRESHOLD;
    
    return NextResponse.json({
      success: true,
      data: {
        profile: {
          id: user.id,
          name: user.name,
          type: user.type,
          stats: {
            coins: user.coins,
            gamesPlayed: user.gamesPlayed,
            winsTotal: user.winsTotal,
            lossesTotal: user.lossesTotal,
            winRate: user.gamesPlayed > 0 
              ? Math.round((user.winsTotal / user.gamesPlayed) * 100) 
              : 0,
            streak: user.streak,
            maxStreak: user.maxStreak,
          },
          ranks: {
            streak: streakRank !== null ? streakRank + 1 : null,
            wins: winsRank !== null ? winsRank + 1 : null,
            coins: coinsRank !== null ? coinsRank + 1 : null,
          },
          cosmetics: {
            owned: user.cosmetics ? user.cosmetics.split(',').filter(Boolean) : [],
            equipped: {
              cardBack: user.equippedCardBack,
              badge: user.equippedBadge,
            },
          },
          accountStatus: isSuspicious ? 'restricted' : 'active',
          createdAt: user.createdAt,
        },
      },
    });
    
  } catch (error) {
    console.error('Profile error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}

// PATCH - Update profile (name, equipped cosmetics)
export async function PATCH(request) {
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
    const { name, equippedCardBack, equippedBadge } = body;
    
    const updates = {};
    
    // Get user data
    const userData = await redis.hgetall(KEYS.user(userId));
    if (!userData) {
      return NextResponse.json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      }, { status: 404 });
    }
    
    // Validate and update name
    if (name !== undefined) {
      if (!validateUsername(name)) {
        return NextResponse.json({
          success: false,
          error: 'Invalid username',
          code: 'INVALID_USERNAME',
        }, { status: 400 });
      }
      updates.n = name;
    }
    
    // Validate and update equipped cosmetics
    const ownedCosmetics = (userData.co || '').split(',').filter(Boolean);
    
    if (equippedCardBack !== undefined) {
      if (equippedCardBack !== 'default' && !ownedCosmetics.includes(equippedCardBack)) {
        return NextResponse.json({
          success: false,
          error: 'You do not own this card back',
          code: 'COSMETIC_NOT_OWNED',
        }, { status: 400 });
      }
      updates.ecb = equippedCardBack;
    }
    
    if (equippedBadge !== undefined) {
      if (equippedBadge !== '' && !ownedCosmetics.includes(equippedBadge)) {
        return NextResponse.json({
          success: false,
          error: 'You do not own this badge',
          code: 'COSMETIC_NOT_OWNED',
        }, { status: 400 });
      }
      updates.eb = equippedBadge;
    }
    
    if (Object.keys(updates).length > 0) {
      await redis.hset(KEYS.user(userId), updates);
    }
    
    return NextResponse.json({
      success: true,
      data: { updated: Object.keys(updates).length > 0 },
    });
    
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}
