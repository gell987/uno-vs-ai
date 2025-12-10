// app/api/shop/buy/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS, SHOP_ITEMS, ANTI_ABUSE } from '@/lib/redis';
import { getAuthUser, userFromRedis, checkRateLimit } from '@/lib/utils';

export async function POST(request) {
  try {
    const { userId, error } = await getAuthUser(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: error || 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    
    const rateLimit = await checkRateLimit(userId, 'shop_buy', 10, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Too many purchases', code: 'RATE_LIMITED' }, { status: 429 });
    }
    
    const body = await request.json();
    const { itemId } = body;
    
    if (!itemId) {
      return NextResponse.json({ success: false, error: 'Item ID required', code: 'MISSING_PARAMS' }, { status: 400 });
    }
    
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) {
      return NextResponse.json({ success: false, error: 'Item not found', code: 'ITEM_NOT_FOUND' }, { status: 404 });
    }
    
    const userData = await redis.hgetall(KEYS.user(userId));
    if (!userData) {
      return NextResponse.json({ success: false, error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 });
    }
    
    const user = userFromRedis(userData);
    
    if (user.antiAbuseScore >= ANTI_ABUSE.SUSPICIOUS_SCORE_THRESHOLD) {
      return NextResponse.json({ success: false, error: 'Account restricted', code: 'ACCOUNT_RESTRICTED' }, { status: 403 });
    }
    
    const ownedItems = user.cosmetics ? user.cosmetics.split(',').filter(Boolean) : [];
    if (ownedItems.includes(itemId)) {
      return NextResponse.json({ success: false, error: 'Already owned', code: 'ALREADY_OWNED' }, { status: 400 });
    }
    
    if (user.coins < item.price) {
      return NextResponse.json({ success: false, error: 'Insufficient coins', code: 'INSUFFICIENT_COINS' }, { status: 400 });
    }
    
    const newBalance = user.coins - item.price;
    ownedItems.push(itemId);
    
    await redis.hset(KEYS.user(userId), { c: newBalance, co: ownedItems.join(',') });
    
    return NextResponse.json({
      success: true,
      data: { itemId, newBalance, ownedCosmetics: ownedItems.join(',') },
    });
    
  } catch (error) {
    console.error('Shop buy error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
