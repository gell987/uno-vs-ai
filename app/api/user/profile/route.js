// app/api/user/profile/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS } from '@/lib/redis';
import { getAuthUser, userFromRedis } from '@/lib/utils';

export async function GET(request) {
  try {
    const { userId, error } = await getAuthUser(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: error || 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    
    const userData = await redis.hgetall(KEYS.user(userId));
    if (!userData) {
      return NextResponse.json({ success: false, error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 });
    }
    
    const user = userFromRedis(userData);
    const winRate = user.gamesPlayed > 0 ? Math.round((user.winsTotal / user.gamesPlayed) * 100) : 0;
    
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
            streak: user.streak,
            maxStreak: user.maxStreak,
            winRate,
          },
          cosmetics: { owned: user.cosmetics ? user.cosmetics.split(',').filter(Boolean) : [], equippedCardBack: user.equippedCardBack, equippedBadge: user.equippedBadge },
          createdAt: user.createdAt,
        },
      },
    });
    
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
