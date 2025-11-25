// app/api/user/login/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS, ANTI_ABUSE } from '@/lib/redis';
import { verifyPassword, createSession, checkRateLimit, getClientInfo, hashIP } from '@/lib/utils';

export async function POST(request) {
  try {
    const { ip } = getClientInfo(request);
    const ipHash = hashIP(ip);
    
    // Rate limit login attempts by IP
    const rateLimit = await checkRateLimit(`ip:${ipHash}`, 'login', 10, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({
        success: false,
        error: `Too many login attempts. Try again in ${rateLimit.resetIn} seconds.`,
        code: 'RATE_LIMITED',
      }, { status: 429 });
    }
    
    const { email, password } = await request.json();
    
    if (!email || !password) {
      return NextResponse.json({
        success: false,
        error: 'Email and password required',
        code: 'MISSING_CREDENTIALS',
      }, { status: 400 });
    }
    
    // Find user by email
    const oderId = await redis.get(KEYS.userByEmail(email));
    if (!oderId) {
      return NextResponse.json({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      }, { status: 401 });
    }
    
    // Get user data
    const userData = await redis.hgetall(KEYS.user(oderId));
    if (!userData || !userData.p) {
      return NextResponse.json({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      }, { status: 401 });
    }
    
    // Verify password
    const valid = await verifyPassword(password, userData.p);
    
    if (!valid) {
      return NextResponse.json({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      }, { status: 401 });
    }
    
    // Check if user is banned
    const antiAbuseScore = parseInt(userData.aa || '0');
    if (antiAbuseScore >= ANTI_ABUSE.BAN_SCORE_THRESHOLD) {
      return NextResponse.json({
        success: false,
        error: 'Account suspended due to suspicious activity',
        code: 'ACCOUNT_SUSPENDED',
      }, { status: 403 });
    }
    
    // Create session
    const sessionToken = await createSession(oderId);
    
    // Return user data
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: userData.i,
          name: userData.n,
          type: userData.t === 'g' ? 'guest' : 'registered',
          coins: parseInt(userData.c || '0'),
          gamesPlayed: parseInt(userData.gp || '0'),
          winsTotal: parseInt(userData.w || '0'),
          streak: parseInt(userData.s || '0'),
          maxStreak: parseInt(userData.ms || '0'),
        },
        sessionToken,
      },
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}
