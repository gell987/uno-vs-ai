// app/api/user/create/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS, TTL } from '@/lib/redis';
import { generateId, userToRedis, createFingerprint, fingerprintToString, validateUsername, recordFingerprint, checkMultiAccount, createSession, getClientInfo } from '@/lib/utils';

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, fingerprint: fpData } = body;
    
    if (!name || !validateUsername(name)) {
      return NextResponse.json({ success: false, error: 'Invalid username (3-20 chars, alphanumeric + underscore)', code: 'INVALID_USERNAME' }, { status: 400 });
    }
    
    const { ip, ua } = getClientInfo(request);
    const fingerprint = createFingerprint(fpData?.browserId || '', ip, ua);
    
    // Check for multi-account abuse
    const multiCheck = await checkMultiAccount(fingerprint);
    
    const userId = generateId('u');
    const now = Date.now();
    
    const user = {
      id: userId,
      name,
      type: 'guest',
      coins: 0,
      gamesPlayed: 0,
      winsTotal: 0,
      lossesTotal: 0,
      streak: 0,
      maxStreak: 0,
      antiAbuseScore: multiCheck.suspicious ? 10 : 0,
      lastGameAt: 0,
      fingerprints: [fingerprintToString(fingerprint)],
      cosmetics: '',
      equippedCardBack: 'default',
      equippedBadge: '',
      createdAt: now,
    };
    
    await redis.hset(KEYS.user(userId), userToRedis(user));
    await recordFingerprint(userId, fingerprint);
    
    const sessionToken = await createSession(userId);
    
    return NextResponse.json({
      success: true,
      data: {
        user: { id: userId, name, type: 'guest', coins: 0, streak: 0, winsTotal: 0 },
        sessionToken,
      },
    });
    
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
