// app/api/user/create/route.js
import { NextResponse } from 'next/server';
import { redis, KEYS, ANTI_ABUSE } from '@/lib/redis';
import {
  generateId, validateUsername, validateEmail, validatePassword,
  hashPassword, createFingerprint, fingerprintToString,
  checkMultiAccount, recordFingerprint, createSession,
  userToRedis, getClientInfo
} from '@/lib/utils';

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, fingerprint: fpData, email, password } = body;
    
    // Validate name
    if (!name || !validateUsername(name)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid username. Must be 3-20 alphanumeric characters.',
        code: 'INVALID_USERNAME',
      }, { status: 400 });
    }
    
    // Get client info
    const { ip, ua } = getClientInfo(request);
    
    // Create fingerprint
    const fingerprint = createFingerprint(
      fpData?.browserId || generateId('fp'),
      ip,
      ua
    );
    
    // Check for multi-account abuse
    const abuseCheck = await checkMultiAccount(fingerprint);
    if (abuseCheck.suspicious) {
      return NextResponse.json({
        success: false,
        error: 'Account creation restricted. Too many accounts detected.',
        code: 'MULTI_ACCOUNT_DETECTED',
      }, { status: 403 });
    }
    
    // Determine user type
    const isRegistered = !!(email && password);
    
    if (isRegistered) {
      // Validate email and password
      if (!validateEmail(email)) {
        return NextResponse.json({
          success: false,
          error: 'Invalid email format.',
          code: 'INVALID_EMAIL',
        }, { status: 400 });
      }
      
      if (!validatePassword(password)) {
        return NextResponse.json({
          success: false,
          error: 'Password must be at least 8 characters with letters and numbers.',
          code: 'WEAK_PASSWORD',
        }, { status: 400 });
      }
      
      // Check if email already exists
      const existingUser = await redis.get(KEYS.userByEmail(email));
      if (existingUser) {
        return NextResponse.json({
          success: false,
          error: 'Email already registered.',
          code: 'EMAIL_EXISTS',
        }, { status: 409 });
      }
    }
    
    // Create user
    const oderId = generateId('u');
    const now = Date.now();
    
    const user = {
      id: oderId,
      name,
      type: isRegistered ? 'registered' : 'guest',
      email: isRegistered ? email : undefined,
      passwordHash: isRegistered ? await hashPassword(password) : undefined,
      coins: 0,
      gamesPlayed: 0,
      winsTotal: 0,
      lossesTotal: 0,
      streak: 0,
      maxStreak: 0,
      antiAbuseScore: abuseCheck.linkedUsers.length > 0 ? 10 : 0,
      lastGameAt: 0,
      fingerprints: [fingerprintToString(fingerprint)],
      cosmetics: '',
      equippedCardBack: 'default',
      equippedBadge: '',
      createdAt: now,
    };
    
    // Save user
    await redis.hset(KEYS.user(oderId), userToRedis(user));
    
    // Save email lookup if registered
    if (isRegistered) {
      await redis.set(KEYS.userByEmail(email), oderId);
    }
    
    // Record fingerprint association
    await recordFingerprint(oderId, fingerprint);
    
    // Create session
    const sessionToken = await createSession(oderId);
    
    // Return safe user data
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          type: user.type,
          coins: user.coins,
          gamesPlayed: user.gamesPlayed,
          winsTotal: user.winsTotal,
          streak: user.streak,
          maxStreak: user.maxStreak,
        },
        sessionToken,
      },
    });
    
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}
