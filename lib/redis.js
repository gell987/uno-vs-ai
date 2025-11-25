// lib/redis.js
import { kv } from "@vercel/kv";

// Use Vercel KV (automatically configured when you add KV to your project)
export const redis = kv;

// Key prefixes - keep short for memory efficiency (30MB free tier)
export const KEYS = {
  // User data
  user: (id) => `u:${id}`, // User hash
  userByEmail: (email) => `ue:${email}`, // Email -> oderId lookup
  userSession: (token) => `us:${token}`, // Session token -> oderId

  // Fingerprint tracking for anti-abuse
  fingerprint: (fp) => `fp:${fp}`, // Fingerprint -> oderId[]
  ipUsers: (ipHash) => `ip:${ipHash}`, // IP hash -> oderId[]

  // Game data
  game: (id) => `g:${id}`, // Game state hash
  gameHand: (gameId, playerIdx) => `gh:${gameId}:${playerIdx}`, // Player hand
  userActiveGame: (oderId) => `uag:${oderId}`, // User's current game

  // Matchmaking
  matchQueue: (difficulty) => `mq:${difficulty}`, // Waiting players

  // Leaderboards (Redis sorted sets)
  leaderboardStreaks: "lb:s",
  leaderboardWins: "lb:w",
  leaderboardCoins: "lb:c",

  // Rate limiting
  rateLimit: (oderId, action) => `rl:${oderId}:${action}`,

  // Anti-abuse
  recentGames: (oderId) => `rg:${oderId}`, // Recent game results
  suspiciousUsers: "sus", // Set of flagged users
};

// Memory-efficient TTLs (in seconds)
export const TTL = {
  session: 7 * 24 * 60 * 60, // 7 days
  game: 30 * 60, // 30 minutes (auto-expire)
  matchQueue: 5 * 60, // 5 minutes
  rateLimit: 60, // 1 minute
  fingerprint: 30 * 24 * 60 * 60, // 30 days
  recentGames: 24 * 60 * 60, // 24 hours
};

// ============ CONSTANTS ============
export const COLORS = ["red", "yellow", "green", "blue"];

export const DIFFICULTY_REWARDS = {
  easy: 10,
  medium: 20,
  hard: 30,
};

export const ANTI_ABUSE = {
  MAX_GAMES_PER_MINUTE: 3,
  MAX_GAMES_PER_HOUR: 30,
  MIN_GAME_DURATION_SECONDS: 60, // Games under 1 min are suspicious
  MAX_WIN_RATE_THRESHOLD: 0.85, // 85%+ win rate triggers review
  MAX_FINGERPRINTS_PER_USER: 3,
  MAX_USERS_PER_FINGERPRINT: 2,
  MAX_USERS_PER_IP: 5,
  SUSPICIOUS_SCORE_THRESHOLD: 50, // Score above this = restricted
  BAN_SCORE_THRESHOLD: 80, // Score above this = banned
};

export const SHOP_ITEMS = [
  // Card Backs
  {
    id: "cb_flame",
    type: "cardBack",
    name: "Flame",
    desc: "Fiery card back",
    price: 50,
    rarity: "common",
  },
  {
    id: "cb_ice",
    type: "cardBack",
    name: "Ice",
    desc: "Frozen card back",
    price: 50,
    rarity: "common",
  },
  {
    id: "cb_galaxy",
    type: "cardBack",
    name: "Galaxy",
    desc: "Cosmic card back",
    price: 150,
    rarity: "rare",
  },
  {
    id: "cb_gold",
    type: "cardBack",
    name: "Gold",
    desc: "Luxurious gold",
    price: 300,
    rarity: "epic",
  },
  {
    id: "cb_holo",
    type: "cardBack",
    name: "Holographic",
    desc: "Shifting colors",
    price: 500,
    rarity: "legendary",
  },

  // Badges
  {
    id: "bd_rookie",
    type: "badge",
    name: "Rookie",
    desc: "Just starting",
    price: 25,
    rarity: "common",
  },
  {
    id: "bd_veteran",
    type: "badge",
    name: "Veteran",
    desc: "100+ games",
    price: 100,
    rarity: "rare",
  },
  {
    id: "bd_champion",
    type: "badge",
    name: "Champion",
    desc: "Tournament winner",
    price: 400,
    rarity: "epic",
  },
  {
    id: "bd_legend",
    type: "badge",
    name: "Legend",
    desc: "Top 10 all-time",
    price: 750,
    rarity: "legendary",
  },

  // Emojis
  {
    id: "em_laugh",
    type: "emoji",
    name: "Laugh",
    desc: "Ha ha!",
    price: 30,
    rarity: "common",
  },
  {
    id: "em_cry",
    type: "emoji",
    name: "Cry",
    desc: "So sad",
    price: 30,
    rarity: "common",
  },
  {
    id: "em_angry",
    type: "emoji",
    name: "Angry",
    desc: "Grr!",
    price: 30,
    rarity: "common",
  },
  {
    id: "em_uno",
    type: "emoji",
    name: "UNO!",
    desc: "Call it out",
    price: 75,
    rarity: "rare",
  },

  // Themes
  {
    id: "th_dark",
    type: "theme",
    name: "Dark Mode",
    desc: "Easy on eyes",
    price: 100,
    rarity: "rare",
  },
  {
    id: "th_neon",
    type: "theme",
    name: "Neon",
    desc: "Cyberpunk vibes",
    price: 200,
    rarity: "epic",
  },
  {
    id: "th_retro",
    type: "theme",
    name: "Retro",
    desc: "80s arcade",
    price: 200,
    rarity: "epic",
  },

  // Animations
  {
    id: "an_confetti",
    type: "animation",
    name: "Confetti",
    desc: "Win celebration",
    price: 150,
    rarity: "rare",
  },
  {
    id: "an_fireworks",
    type: "animation",
    name: "Fireworks",
    desc: "Explosive wins",
    price: 250,
    rarity: "epic",
  },
  {
    id: "an_lightning",
    type: "animation",
    name: "Lightning",
    desc: "+4 effect",
    price: 350,
    rarity: "epic",
  },
];
