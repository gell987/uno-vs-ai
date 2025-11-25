// lib/utils.js
import { createHash, randomBytes } from 'crypto';
import { redis, KEYS, TTL, COLORS, ANTI_ABUSE } from './redis';

// ============ ID GENERATION ============
export function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(6).toString('hex');
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

export function generateSessionToken() {
  return randomBytes(32).toString('hex');
}

// ============ HASHING ============
export function hashString(input) {
  return createHash('sha256').update(input).digest('hex').substring(0, 16);
}

export function hashIP(ip) {
  const salt = process.env.IP_HASH_SALT || 'uno-game-salt-2024';
  return hashString(`${ip}:${salt}`);
}

export function hashUA(ua) {
  return hashString(ua);
}

// Argon2 password hashing (dynamic import for edge compatibility)
export async function hashPassword(password) {
  const argon2 = await import('argon2');
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,    // 64MB
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(password, hash) {
  try {
    const argon2 = await import('argon2');
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// ============ FINGERPRINT ============
export function createFingerprint(browserId, ip, ua) {
  return {
    browserId: hashString(browserId || generateId('fp')),
    ipHash: hashIP(ip),
    uaHash: hashUA(ua),
  };
}

export function fingerprintToString(fp) {
  return `${fp.browserId}:${fp.ipHash}:${fp.uaHash}`;
}

// ============ USER SERIALIZATION (Memory Optimization) ============
// Compress user object for Redis storage (short keys = less memory)
export function userToRedis(user) {
  return {
    i: user.id,
    n: user.name,
    t: user.type === 'guest' ? 'g' : 'r',
    e: user.email || '',
    p: user.passwordHash || '',
    c: user.coins,
    gp: user.gamesPlayed,
    w: user.winsTotal,
    l: user.lossesTotal,
    s: user.streak,
    ms: user.maxStreak,
    aa: user.antiAbuseScore,
    lg: user.lastGameAt,
    fp: user.fingerprints.join(','),
    co: user.cosmetics,
    ecb: user.equippedCardBack,
    eb: user.equippedBadge,
    ca: user.createdAt,
  };
}

export function userFromRedis(data) {
  return {
    id: data.i,
    name: data.n,
    type: data.t === 'g' ? 'guest' : 'registered',
    email: data.e || undefined,
    passwordHash: data.p || undefined,
    coins: parseInt(data.c) || 0,
    gamesPlayed: parseInt(data.gp) || 0,
    winsTotal: parseInt(data.w) || 0,
    lossesTotal: parseInt(data.l) || 0,
    streak: parseInt(data.s) || 0,
    maxStreak: parseInt(data.ms) || 0,
    antiAbuseScore: parseInt(data.aa) || 0,
    lastGameAt: parseInt(data.lg) || 0,
    fingerprints: data.fp ? data.fp.split(',').filter(Boolean) : [],
    cosmetics: data.co || '',
    equippedCardBack: data.ecb || 'default',
    equippedBadge: data.eb || '',
    createdAt: parseInt(data.ca) || Date.now(),
  };
}

// ============ GAME SERIALIZATION ============
const COLOR_MAP = { r: 'red', y: 'yellow', g: 'green', b: 'blue', w: 'wild' };
const COLOR_REV = { red: 'r', yellow: 'y', green: 'g', blue: 'b', wild: 'w' };
const STATUS_MAP = { w: 'waiting', p: 'playing', f: 'finished' };
const STATUS_REV = { waiting: 'w', playing: 'p', finished: 'f' };
const DIFF_MAP = { e: 'easy', m: 'medium', h: 'hard' };
const DIFF_REV = { easy: 'e', medium: 'm', hard: 'h' };

export function gameToRedis(game) {
  return {
    i: game.id,
    st: STATUS_REV[game.status],
    d: DIFF_REV[game.difficulty],
    ps: JSON.stringify(game.players.map(p => ({
      o: p.order,
      u: p.oderId,
      n: p.name,
      t: p.type === 'human' ? 'h' : 'b',
      h: p.handSize,
      c: p.calledUno ? 1 : 0,
      cn: p.connected ? 1 : 0,
    }))),
    cp: game.currentPlayerIndex,
    dir: game.direction,
    dk: game.deckIds.join(','),
    dt: game.discardTopId,
    dc: COLOR_REV[game.discardColor],
    dp: game.drawPending,
    ca: game.createdAt,
    lm: game.lastMoveAt,
    mc: game.moveCount,
    w: game.winner ?? -1,
    fa: game.finishedAt || 0,
  };
}

export function gameFromRedis(data) {
  const players = JSON.parse(data.ps || '[]').map(p => ({
    order: p.o,
    oderId: p.u,
    name: p.n,
    type: p.t === 'h' ? 'human' : 'bot',
    handSize: p.h,
    calledUno: p.c === 1,
    connected: p.cn === 1,
  }));
  
  return {
    id: data.i,
    status: STATUS_MAP[data.st] || 'waiting',
    difficulty: DIFF_MAP[data.d] || 'easy',
    players,
    currentPlayerIndex: parseInt(data.cp) || 0,
    direction: parseInt(data.dir) || 1,
    deckIds: data.dk ? data.dk.split(',').map(Number) : [],
    discardTopId: parseInt(data.dt) || 0,
    discardColor: COLOR_MAP[data.dc] || 'red',
    drawPending: parseInt(data.dp) || 0,
    createdAt: parseInt(data.ca) || Date.now(),
    lastMoveAt: parseInt(data.lm) || Date.now(),
    moveCount: parseInt(data.mc) || 0,
    winner: parseInt(data.w) >= 0 ? parseInt(data.w) : undefined,
    finishedAt: parseInt(data.fa) || undefined,
  };
}

// ============ VALIDATION ============
export function validateUsername(name) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(name);
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password) {
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
}

// ============ ANTI-ABUSE FUNCTIONS ============
export async function checkMultiAccount(fingerprint, excludeUserId = null) {
  const fpString = fingerprintToString(fingerprint);
  const linkedUsers = new Set();
  
  // Check fingerprint associations
  const fpUsers = await redis.smembers(KEYS.fingerprint(fpString));
  fpUsers.forEach(u => linkedUsers.add(u));
  
  // Check IP associations
  const ipUsers = await redis.smembers(KEYS.ipUsers(fingerprint.ipHash));
  ipUsers.forEach(u => linkedUsers.add(u));
  
  // Remove current user
  if (excludeUserId) {
    linkedUsers.delete(excludeUserId);
  }
  
  const linkedArray = Array.from(linkedUsers);
  
  // Check thresholds
  if (linkedArray.length >= ANTI_ABUSE.MAX_USERS_PER_FINGERPRINT) {
    return {
      suspicious: true,
      reason: 'Too many accounts from same device',
      linkedUsers: linkedArray,
    };
  }
  
  if (ipUsers.length >= ANTI_ABUSE.MAX_USERS_PER_IP) {
    return {
      suspicious: true,
      reason: 'Too many accounts from same IP',
      linkedUsers: linkedArray,
    };
  }
  
  return { suspicious: false, linkedUsers: linkedArray };
}

export async function recordFingerprint(oderId, fingerprint) {
  const fpString = fingerprintToString(fingerprint);
  
  await redis.sadd(KEYS.fingerprint(fpString), oderId);
  await redis.expire(KEYS.fingerprint(fpString), TTL.fingerprint);
  
  await redis.sadd(KEYS.ipUsers(fingerprint.ipHash), oderId);
  await redis.expire(KEYS.ipUsers(fingerprint.ipHash), TTL.fingerprint);
}

export async function recordGameResult(result) {
  const key = KEYS.recentGames(result.oderId);
  
  // Store as JSON, keep last 20 games
  await redis.lpush(key, JSON.stringify(result));
  await redis.ltrim(key, 0, 19);
  await redis.expire(key, TTL.recentGames);
}

export async function analyzeGamePatterns(oderId) {
  const key = KEYS.recentGames(oderId);
  const recentGamesRaw = await redis.lrange(key, 0, 19);
  
  if (recentGamesRaw.length < 5) {
    return { suspicious: false, score: 0, reasons: [] };
  }
  
  const recentGames = recentGamesRaw.map(g => 
    typeof g === 'string' ? JSON.parse(g) : g
  );
  
  const reasons = [];
  let score = 0;
  
  // Check 1: Win rate too high
  const wins = recentGames.filter(g => g.won).length;
  const winRate = wins / recentGames.length;
  if (winRate > ANTI_ABUSE.MAX_WIN_RATE_THRESHOLD && recentGames.length >= 10) {
    reasons.push(`Abnormally high win rate: ${(winRate * 100).toFixed(1)}%`);
    score += 20;
  }
  
  // Check 2: Games too fast
  const fastGames = recentGames.filter(g => g.duration < ANTI_ABUSE.MIN_GAME_DURATION_SECONDS);
  if (fastGames.length > recentGames.length * 0.3) {
    reasons.push(`${fastGames.length} games completed suspiciously fast`);
    score += 25;
  }
  
  // Check 3: Same opponent repeatedly (collusion detection)
  const opponentCounts = {};
  recentGames.forEach(g => {
    opponentCounts[g.opponentId] = (opponentCounts[g.opponentId] || 0) + 1;
  });
  
  const maxSameOpponent = Math.max(...Object.values(opponentCounts));
  if (maxSameOpponent > recentGames.length * 0.5 && maxSameOpponent >= 5) {
    reasons.push(`Played same opponent ${maxSameOpponent} times`);
    score += 30;
  }
  
  // Check 4: Opponent always disconnects (win trading)
  const disconnectWins = recentGames.filter(g => 
    g.won && g.moveCount < 10 && g.opponentType === 'human'
  );
  if (disconnectWins.length > 3) {
    reasons.push(`${disconnectWins.length} wins from early disconnects`);
    score += 35;
  }
  
  // Check 5: Bot-like time patterns
  const hourCounts = {};
  recentGames.forEach(g => {
    const hour = new Date(g.timestamp).getUTCHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  
  const maxHourConcentration = Math.max(...Object.values(hourCounts)) / recentGames.length;
  if (maxHourConcentration > 0.7 && recentGames.length >= 10) {
    reasons.push('Games concentrated in narrow time window');
    score += 15;
  }
  
  return {
    suspicious: score >= ANTI_ABUSE.SUSPICIOUS_SCORE_THRESHOLD,
    score,
    reasons,
  };
}

export async function updateAntiAbuseScore(oderId, delta) {
  const key = KEYS.user(oderId);
  const newScore = await redis.hincrby(key, 'aa', delta);
  
  // Clamp between 0 and 100
  if (newScore > 100) {
    await redis.hset(key, { aa: 100 });
    return 100;
  }
  if (newScore < 0) {
    await redis.hset(key, { aa: 0 });
    return 0;
  }
  
  return newScore;
}

// ============ RATE LIMITING ============
export async function checkRateLimit(oderId, action, maxRequests, windowSeconds = 60) {
  const key = KEYS.rateLimit(oderId, action);
  
  const count = await redis.incr(key);
  let ttl = await redis.ttl(key);
  
  // Set expiry on first request
  if (ttl === -1) {
    await redis.expire(key, windowSeconds);
    ttl = windowSeconds;
  }
  
  return {
    allowed: count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
    resetIn: ttl,
  };
}

// ============ SESSION MANAGEMENT ============
export async function createSession(oderId) {
  const token = generateSessionToken();
  await redis.set(KEYS.userSession(token), oderId, { ex: TTL.session });
  return token;
}

export async function validateSession(token) {
  if (!token) return null;
  const oderId = await redis.get(KEYS.userSession(token));
  return oderId;
}

export async function invalidateSession(token) {
  await redis.del(KEYS.userSession(token));
}

// ============ AUTH MIDDLEWARE HELPER ============
export async function getAuthUser(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { userId: null, error: 'Missing authorization header' };
  }
  
  const token = authHeader.substring(7);
  const userId = await validateSession(token);
  
  if (!userId) {
    return { userId: null, error: 'Invalid or expired session' };
  }
  
  return { userId };
}

// ============ GET CLIENT INFO ============
export function getClientInfo(request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
             request.headers.get('x-real-ip') || 
             '127.0.0.1';
  const ua = request.headers.get('user-agent') || 'unknown';
  return { ip, ua };
}
