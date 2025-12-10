// lib/utils.js
import { createHash, randomBytes } from 'crypto';
import { redis, KEYS, TTL, ANTI_ABUSE } from './redis';

export function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

export function generateSessionToken() {
  return randomBytes(32).toString('hex');
}

export function hashString(input) {
  return createHash('sha256').update(input).digest('hex').substring(0, 16);
}

export function hashIP(ip) {
  const salt = process.env.IP_HASH_SALT || 'uno-game-salt';
  return hashString(`${ip}:${salt}`);
}

export async function hashPassword(password) {
  const argon2 = await import('argon2');
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
}

export async function verifyPassword(password, hash) {
  try {
    const argon2 = await import('argon2');
    return await argon2.verify(hash, password);
  } catch { return false; }
}

export function createFingerprint(browserId, ip, ua) {
  return {
    browserId: hashString(browserId || generateId('fp')),
    ipHash: hashIP(ip),
    uaHash: hashString(ua || 'unknown'),
  };
}

export function fingerprintToString(fp) {
  return `${fp.browserId}:${fp.ipHash}:${fp.uaHash}`;
}

// User serialization
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
    fp: Array.isArray(user.fingerprints) ? user.fingerprints.join(',') : (user.fingerprints || ''),
    co: user.cosmetics || '',
    ecb: user.equippedCardBack || 'default',
    eb: user.equippedBadge || '',
    ca: user.createdAt,
  };
}

export function userFromRedis(data) {
  let fingerprints = data.fp || '';
  if (typeof fingerprints === 'string') {
    fingerprints = fingerprints.split(',').filter(Boolean);
  } else if (!Array.isArray(fingerprints)) {
    fingerprints = [];
  }

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
    fingerprints,
    cosmetics: typeof data.co === 'string' ? data.co : '',
    equippedCardBack: data.ecb || 'default',
    equippedBadge: data.eb || '',
    createdAt: parseInt(data.ca) || Date.now(),
  };
}

// Game serialization
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
      o: p.order, u: p.oderId, n: p.name, t: p.type === 'human' ? 'h' : 'b',
      h: p.handSize, c: p.calledUno ? 1 : 0, cn: p.connected ? 1 : 0,
    }))),
    cp: game.currentPlayerIndex,
    dir: game.direction,
    dk: Array.isArray(game.deckIds) ? game.deckIds.join(',') : '',
    dt: game.discardTopId,
    dc: COLOR_REV[game.discardColor] || 'r',
    dp: game.drawPending,
    ca: game.createdAt,
    lm: game.lastMoveAt,
    mc: game.moveCount,
    w: game.winner ?? -1,
    fa: game.finishedAt || 0,
  };
}

export function gameFromRedis(data) {
  // Handle players - might be string or object
  let playersRaw = data.ps || '[]';
  if (typeof playersRaw === 'string') {
    try { playersRaw = JSON.parse(playersRaw); } catch { playersRaw = []; }
  }
  
  const players = (Array.isArray(playersRaw) ? playersRaw : []).map(p => ({
    order: p.o, oderId: p.u, name: p.n, type: p.t === 'h' ? 'human' : 'bot',
    handSize: p.h, calledUno: p.c === 1, connected: p.cn === 1,
  }));
  
  // Handle deckIds - might be string or array
  let deckIds = data.dk || [];
  if (typeof deckIds === 'string') {
    deckIds = deckIds ? deckIds.split(',').filter(Boolean).map(Number) : [];
  }
  
  const winner = parseInt(data.w);
  
  return {
    id: data.i,
    status: STATUS_MAP[data.st] || 'waiting',
    difficulty: DIFF_MAP[data.d] || 'easy',
    players,
    currentPlayerIndex: parseInt(data.cp) || 0,
    direction: parseInt(data.dir) || 1,
    deckIds,
    discardTopId: parseInt(data.dt) || 0,
    discardColor: COLOR_MAP[data.dc] || 'red',
    drawPending: parseInt(data.dp) || 0,
    createdAt: parseInt(data.ca) || Date.now(),
    lastMoveAt: parseInt(data.lm) || Date.now(),
    moveCount: parseInt(data.mc) || 0,
    winner: winner >= 0 ? winner : undefined,
    finishedAt: parseInt(data.fa) || undefined,
  };
}

// Validation
export function validateUsername(name) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(name);
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password) {
  return password.length >= 8;
}

// Anti-abuse
export async function checkMultiAccount(fingerprint, excludeUserId = null) {
  const fpString = fingerprintToString(fingerprint);
  const linkedUsers = new Set();
  
  const fpUsers = await redis.smembers(KEYS.fingerprint(fpString)) || [];
  fpUsers.forEach(u => linkedUsers.add(u));
  
  const ipUsers = await redis.smembers(KEYS.ipUsers(fingerprint.ipHash)) || [];
  ipUsers.forEach(u => linkedUsers.add(u));
  
  if (excludeUserId) linkedUsers.delete(excludeUserId);
  
  const linkedArray = Array.from(linkedUsers);
  
  if (linkedArray.length >= ANTI_ABUSE.MAX_USERS_PER_FINGERPRINT) {
    return { suspicious: true, reason: 'Too many accounts from same device', linkedUsers: linkedArray };
  }
  
  if (ipUsers.length >= ANTI_ABUSE.MAX_USERS_PER_IP) {
    return { suspicious: true, reason: 'Too many accounts from same IP', linkedUsers: linkedArray };
  }
  
  return { suspicious: false, linkedUsers: linkedArray };
}

export async function recordFingerprint(userId, fingerprint) {
  const fpString = fingerprintToString(fingerprint);
  await redis.sadd(KEYS.fingerprint(fpString), userId);
  await redis.expire(KEYS.fingerprint(fpString), TTL.fingerprint);
  await redis.sadd(KEYS.ipUsers(fingerprint.ipHash), userId);
  await redis.expire(KEYS.ipUsers(fingerprint.ipHash), TTL.fingerprint);
}

export async function recordGameResult(result) {
  const key = KEYS.recentGames(result.oderId);
  await redis.lpush(key, JSON.stringify(result));
  await redis.ltrim(key, 0, 19);
  await redis.expire(key, TTL.recentGames);
}

export async function analyzeGamePatterns(userId) {
  const key = KEYS.recentGames(userId);
  const recentGamesRaw = await redis.lrange(key, 0, 19) || [];
  
  if (recentGamesRaw.length < 5) {
    return { suspicious: false, score: 0, reasons: [] };
  }
  
  const recentGames = recentGamesRaw.map(g => typeof g === 'string' ? JSON.parse(g) : g);
  
  let score = 0;
  const reasons = [];
  
  const wins = recentGames.filter(g => g.won).length;
  const winRate = wins / recentGames.length;
  if (winRate > ANTI_ABUSE.MAX_WIN_RATE_THRESHOLD && recentGames.length >= 10) {
    reasons.push(`High win rate: ${(winRate * 100).toFixed(1)}%`);
    score += 20;
  }
  
  const fastGames = recentGames.filter(g => g.duration < ANTI_ABUSE.MIN_GAME_DURATION_SECONDS);
  if (fastGames.length > recentGames.length * 0.3) {
    reasons.push(`${fastGames.length} fast games`);
    score += 25;
  }
  
  return { suspicious: score >= ANTI_ABUSE.SUSPICIOUS_SCORE_THRESHOLD, score, reasons };
}

export async function updateAntiAbuseScore(userId, delta) {
  const key = KEYS.user(userId);
  const newScore = await redis.hincrby(key, 'aa', delta);
  if (newScore > 100) await redis.hset(key, { aa: 100 });
  if (newScore < 0) await redis.hset(key, { aa: 0 });
  return Math.max(0, Math.min(100, newScore));
}

// Rate limiting
export async function checkRateLimit(userId, action, maxRequests, windowSeconds = 60) {
  const key = KEYS.rateLimit(userId, action);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
  const ttl = await redis.ttl(key);
  return { allowed: count <= maxRequests, remaining: Math.max(0, maxRequests - count), resetIn: ttl > 0 ? ttl : windowSeconds };
}

// Session management
export async function createSession(userId) {
  const token = generateSessionToken();
  await redis.set(KEYS.userSession(token), userId, { ex: TTL.session });
  return token;
}

export async function validateSession(token) {
  if (!token) return null;
  return await redis.get(KEYS.userSession(token));
}

export async function getAuthUser(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { userId: null, error: 'Missing authorization header' };
  }
  const token = authHeader.substring(7);
  const userId = await validateSession(token);
  if (!userId) return { userId: null, error: 'Invalid or expired session' };
  return { userId };
}

export function getClientInfo(request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || '127.0.0.1';
  const ua = request.headers.get('user-agent') || 'unknown';
  return { ip, ua };
}
