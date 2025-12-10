// lib/redis.js
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const KEYS = {
  user: (id) => `u:${id}`,
  userByEmail: (email) => `ue:${email}`,
  userSession: (token) => `us:${token}`,
  fingerprint: (fp) => `fp:${fp}`,
  ipUsers: (ipHash) => `ip:${ipHash}`,
  game: (id) => `g:${id}`,
  gameHand: (gameId, playerIdx) => `gh:${gameId}:${playerIdx}`,
  userActiveGame: (userId) => `uag:${userId}`,
  leaderboardStreaks: 'lb:s',
  leaderboardWins: 'lb:w',
  leaderboardCoins: 'lb:c',
  rateLimit: (userId, action) => `rl:${userId}:${action}`,
  recentGames: (userId) => `rg:${userId}`,
};

export const TTL = {
  session: 7 * 24 * 60 * 60,
  game: 30 * 60,
  rateLimit: 60,
  fingerprint: 30 * 24 * 60 * 60,
  recentGames: 24 * 60 * 60,
};

export const COLORS = ['red', 'yellow', 'green', 'blue'];

export const DIFFICULTY_REWARDS = { easy: 10, medium: 20, hard: 30 };

export const ANTI_ABUSE = {
  MAX_USERS_PER_FINGERPRINT: 2,
  MAX_USERS_PER_IP: 5,
  MIN_GAME_DURATION_SECONDS: 60,
  MAX_WIN_RATE_THRESHOLD: 0.85,
  SUSPICIOUS_SCORE_THRESHOLD: 50,
  BAN_SCORE_THRESHOLD: 80,
};

export const SHOP_ITEMS = [
  { id: 'cb_flame', type: 'cardBack', name: 'Flame', desc: 'Fiery card back', price: 50, rarity: 'common' },
  { id: 'cb_ice', type: 'cardBack', name: 'Ice', desc: 'Frozen card back', price: 50, rarity: 'common' },
  { id: 'cb_galaxy', type: 'cardBack', name: 'Galaxy', desc: 'Cosmic card back', price: 150, rarity: 'rare' },
  { id: 'cb_gold', type: 'cardBack', name: 'Gold', desc: 'Luxurious gold', price: 300, rarity: 'epic' },
  { id: 'bd_rookie', type: 'badge', name: 'Rookie', desc: 'Just starting', price: 25, rarity: 'common' },
  { id: 'bd_veteran', type: 'badge', name: 'Veteran', desc: '100+ games', price: 100, rarity: 'rare' },
  { id: 'bd_champion', type: 'badge', name: 'Champion', desc: 'Tournament winner', price: 400, rarity: 'epic' },
  { id: 'em_laugh', type: 'emoji', name: 'Laugh', desc: 'Ha ha!', price: 30, rarity: 'common' },
  { id: 'em_cry', type: 'emoji', name: 'Cry', desc: 'So sad', price: 30, rarity: 'common' },
  { id: 'em_uno', type: 'emoji', name: 'UNO!', desc: 'Call it out', price: 75, rarity: 'rare' },
  { id: 'th_dark', type: 'theme', name: 'Dark Mode', desc: 'Easy on eyes', price: 100, rarity: 'rare' },
  { id: 'th_neon', type: 'theme', name: 'Neon', desc: 'Cyberpunk vibes', price: 200, rarity: 'epic' },
];
