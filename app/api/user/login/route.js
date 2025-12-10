// app/api/user/login/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS } from '@/lib/redis';
import { userFromRedis, verifyPassword, createSession, checkRateLimit, getClientInfo, hashIP } from '@/lib/utils';

export async function POST(request) {
  try {
    const { ip } = getClientInfo(request);
    const ipHash = hashIP(ip);
    
    const rateLimit = await checkRateLimit(ipHash, 'login', 10, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Too many login attempts', code: 'RATE_LIMITED' }, { status: 429 });
    }
    
    const body = await request.json();
    const { email, password } = body;
    
    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email and password required', code: 'MISSING_CREDENTIALS' }, { status: 400 });
    }
    
    const userId = await redis.get(KEYS.userByEmail(email.toLowerCase()));
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }, { status: 401 });
    }
    
    const userData = await redis.hgetall(KEYS.user(userId));
    if (!userData) {
      return NextResponse.json({ success: false, error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 });
    }
    
    const user = userFromRedis(userData);
    
    if (!user.passwordHash) {
      return NextResponse.json({ success: false, error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }, { status: 401 });
    }
    
    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ success: false, error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }, { status: 401 });
    }
    
    const sessionToken = await createSession(userId);
    
    return NextResponse.json({
      success: true,
      data: {
        user: { id: user.id, name: user.name, type: user.type, coins: user.coins, streak: user.streak, winsTotal: user.winsTotal },
        sessionToken,
      },
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
