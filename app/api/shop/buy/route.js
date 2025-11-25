// app/api/shop/buy/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS, SHOP_ITEMS, ANTI_ABUSE } from '@/lib/redis';
import { getAuthUser, checkRateLimit, updateAntiAbuseScore } from '@/lib/utils';

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
    
    // Rate limit purchases
    const rateLimit = await checkRateLimit(userId, 'shop_buy', 10, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({
        success: false,
        error: 'Too many purchases. Try again later.',
        code: 'RATE_LIMITED',
      }, { status: 429 });
    }
    
    const body = await request.json();
    const { itemId } = body;
    
    if (!itemId) {
      return NextResponse.json({
        success: false,
        error: 'Item ID required',
        code: 'MISSING_ITEM_ID',
      }, { status: 400 });
    }
    
    // Find the item
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) {
      return NextResponse.json({
        success: false,
        error: 'Item not found',
        code: 'ITEM_NOT_FOUND',
      }, { status: 404 });
    }
    
    // Get user data
    const userData = await redis.hgetall(KEYS.user(userId));
    if (!userData) {
      return NextResponse.json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      }, { status: 404 });
    }
    
    // Check if user is restricted
    const antiAbuseScore = parseInt(userData.aa || '0');
    if (antiAbuseScore >= ANTI_ABUSE.SUSPICIOUS_SCORE_THRESHOLD) {
      return NextResponse.json({
        success: false,
        error: 'Purchases restricted due to suspicious activity',
        code: 'ACCOUNT_RESTRICTED',
      }, { status: 403 });
    }
    
    // Check if user already owns the item
    const ownedCosmetics = (userData.co || '').split(',').filter(Boolean);
    if (ownedCosmetics.includes(itemId)) {
      return NextResponse.json({
        success: false,
        error: 'You already own this item',
        code: 'ALREADY_OWNED',
      }, { status: 400 });
    }
    
    // Check if user has enough coins
    const userCoins = parseInt(userData.c || '0');
    if (userCoins < item.price) {
      return NextResponse.json({
        success: false,
        error: `Not enough coins. Need ${item.price}, have ${userCoins}.`,
        code: 'INSUFFICIENT_COINS',
      }, { status: 400 });
    }
    
    // Process purchase
    const newCoins = userCoins - item.price;
    const newCosmetics = [...ownedCosmetics, itemId].join(',');
    
    await redis.hset(KEYS.user(userId), {
      c: newCoins,
      co: newCosmetics,
    });
    
    // Update coins leaderboard
    await redis.zadd(KEYS.leaderboardCoins, { score: newCoins, member: userId });
    
    return NextResponse.json({
      success: true,
      data: {
        purchased: item,
        newBalance: newCoins,
        ownedCosmetics: [...ownedCosmetics, itemId],
      },
    });
    
  } catch (error) {
    console.error('Shop buy error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}
