// lib/game-engine.js
import { redis, KEYS, TTL, COLORS, DIFFICULTY_REWARDS } from './redis';
import { generateId, gameToRedis, gameFromRedis, recordGameResult } from './utils';

// Deck generation
const NUMBER_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const ACTION_VALUES = ['skip', 'reverse', 'draw2'];

function generateDeckLookup() {
  const deck = [];
  let id = 0;
  COLORS.forEach(color => {
    deck.push({ color, value: '0', id: id++ });
    NUMBER_VALUES.slice(1).forEach(value => {
      deck.push({ color, value, id: id++ });
      deck.push({ color, value, id: id++ });
    });
    ACTION_VALUES.forEach(value => {
      deck.push({ color, value, id: id++ });
      deck.push({ color, value, id: id++ });
    });
  });
  for (let i = 0; i < 4; i++) deck.push({ color: 'wild', value: 'wild', id: id++ });
  for (let i = 0; i < 4; i++) deck.push({ color: 'wild', value: 'wild4', id: id++ });
  return deck;
}

const DECK_LOOKUP = generateDeckLookup();

export function getCardById(id) { return DECK_LOOKUP[id] || null; }
export function createDeck() { return [...DECK_LOOKUP]; }

export function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getCardPointValue(card) {
  if (card.value === 'wild' || card.value === 'wild4') return 50;
  if (ACTION_VALUES.includes(card.value)) return 20;
  return parseInt(card.value) || 0;
}

const BOT_NAMES = {
  easy: ['Rookie Bot', 'Beginner Bot', 'Newbie Bot'],
  medium: ['Smart Bot', 'Clever Bot', 'Sharp Bot'],
  hard: ['Expert Bot', 'Master Bot', 'Pro Bot'],
};

function getBotName(difficulty) {
  const names = BOT_NAMES[difficulty] || BOT_NAMES.easy;
  return names[Math.floor(Math.random() * names.length)];
}

// Clear active game
export async function clearActiveGame(userId) {
  await redis.del(KEYS.userActiveGame(userId));
}

// Check and cleanup stale games
export async function checkAndCleanupActiveGame(userId) {
  const activeGameId = await redis.get(KEYS.userActiveGame(userId));
  if (!activeGameId) return null;
  
  const gameData = await redis.hgetall(KEYS.game(activeGameId));
  if (!gameData || Object.keys(gameData).length === 0) {
    await clearActiveGame(userId);
    return null;
  }
  
  const game = gameFromRedis(gameData);
  if (game.status === 'finished') {
    await clearActiveGame(userId);
    return null;
  }
  
  return activeGameId;
}

// Game creation
export async function createGame(hostUserId, hostName, difficulty, vsBot = false) {
  const gameId = generateId('g');
  const now = Date.now();
  
  const deck = shuffleArray(createDeck());
  const deckIds = deck.map(c => c.id);
  
  const hostHandIds = deckIds.splice(0, 7);
  const opponentHandIds = vsBot ? deckIds.splice(0, 7) : [];
  
  // Find valid starting card (not wild or action)
  let startCardIndex = 0;
  while (startCardIndex < deckIds.length) {
    const card = getCardById(deckIds[startCardIndex]);
    if (card && card.color !== 'wild' && !ACTION_VALUES.includes(card.value)) break;
    startCardIndex++;
  }
  
  const discardTopId = deckIds.splice(startCardIndex, 1)[0];
  const discardCard = getCardById(discardTopId);
  
  const players = [{
    order: 0, oderId: hostUserId, name: hostName, type: 'human',
    handSize: 7, calledUno: false, connected: true,
  }];
  
  if (vsBot) {
    players.push({
      order: 1, oderId: `bot_${difficulty}_${gameId}`, name: getBotName(difficulty),
      type: 'bot', handSize: 7, calledUno: false, connected: true,
    });
  }
  
  const gameState = {
    id: gameId, status: vsBot ? 'playing' : 'waiting', difficulty, players,
    currentPlayerIndex: 0, direction: 1, deckIds, discardTopId,
    discardColor: discardCard.color, drawPending: 0,
    createdAt: now, lastMoveAt: now, moveCount: 0,
  };
  
  await redis.hset(KEYS.game(gameId), gameToRedis(gameState));
  await redis.expire(KEYS.game(gameId), TTL.game);
  await redis.set(KEYS.gameHand(gameId, 0), hostHandIds.join(','), { ex: TTL.game });
  if (vsBot) await redis.set(KEYS.gameHand(gameId, 1), opponentHandIds.join(','), { ex: TTL.game });
  await redis.set(KEYS.userActiveGame(hostUserId), gameId, { ex: TTL.game });
  
  return gameState;
}

// Game state helpers
export async function getGameState(gameId) {
  const gameData = await redis.hgetall(KEYS.game(gameId));
  if (!gameData || Object.keys(gameData).length === 0) return null;
  return gameFromRedis(gameData);
}

export async function getPlayerHand(gameId, playerIndex) {
  const handStr = await redis.get(KEYS.gameHand(gameId, playerIndex));
  if (!handStr || typeof handStr !== 'string') return [];
  return handStr.split(',').filter(Boolean).map(Number);
}

async function saveGameState(gameId, game) {
  await redis.hset(KEYS.game(gameId), gameToRedis(game));
  await redis.expire(KEYS.game(gameId), TTL.game);
}

async function savePlayerHand(gameId, playerIndex, hand) {
  await redis.set(KEYS.gameHand(gameId, playerIndex), hand.join(','), { ex: TTL.game });
}

// Game logic
export function canPlayCard(card, topCard, currentColor, drawPending) {
  if (drawPending > 0) {
    if (topCard.value === 'draw2') return card.value === 'draw2' || card.value === 'wild4';
    if (topCard.value === 'wild4') return card.value === 'wild4';
  }
  if (card.color === 'wild') return true;
  return card.color === currentColor || card.value === topCard.value;
}

function drawCardsFromDeck(game, count) {
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (game.deckIds.length === 0) {
      const usedIds = new Set([game.discardTopId, ...drawn]);
      const availableIds = Array.from({ length: 108 }, (_, i) => i).filter(id => !usedIds.has(id));
      game.deckIds = shuffleArray(availableIds);
    }
    if (game.deckIds.length > 0) drawn.push(game.deckIds.shift());
  }
  return drawn;
}

function advanceToNextPlayer(game) {
  game.currentPlayerIndex = (game.currentPlayerIndex + game.direction + 2) % 2;
}

// Play card
export async function playCard(gameId, userId, cardId, chosenColor = null) {
  const game = await getGameState(gameId);
  if (!game) return { success: false, error: 'Game not found' };
  if (game.status !== 'playing') return { success: false, error: 'Game not in progress' };
  
  const playerIndex = game.players.findIndex(p => p.oderId === userId);
  if (playerIndex === -1) return { success: false, error: 'Player not in game' };
  if (game.currentPlayerIndex !== playerIndex) return { success: false, error: 'Not your turn' };
  
  const hand = await getPlayerHand(gameId, playerIndex);
  const cardIndex = hand.indexOf(cardId);
  if (cardIndex === -1) return { success: false, error: 'Card not in hand' };
  
  const card = getCardById(cardId);
  const topCard = getCardById(game.discardTopId);
  
  if (!canPlayCard(card, topCard, game.discardColor, game.drawPending)) {
    return { success: false, error: 'Cannot play this card' };
  }
  
  if (card.color === 'wild' && !COLORS.includes(chosenColor)) {
    return { success: false, error: 'Must choose a color for wild card' };
  }
  
  // UNO penalty
  let penaltyApplied = false;
  if (hand.length === 2 && !game.players[playerIndex].calledUno) {
    const penaltyCards = drawCardsFromDeck(game, 2);
    hand.push(...penaltyCards);
    penaltyApplied = true;
  }
  
  hand.splice(cardIndex, 1);
  game.discardTopId = cardId;
  game.discardColor = card.color === 'wild' ? chosenColor : card.color;
  game.players[playerIndex].handSize = hand.length;
  game.players[playerIndex].calledUno = false;
  game.lastMoveAt = Date.now();
  game.moveCount++;
  
  // Handle draw stacking
  if (game.drawPending > 0 && (card.value === 'draw2' || card.value === 'wild4')) {
    game.drawPending += card.value === 'draw2' ? 2 : 4;
  } else if (card.value === 'draw2') {
    game.drawPending = 2;
  } else if (card.value === 'wild4') {
    game.drawPending = 4;
  }
  
  // Check for win
  if (hand.length === 0) {
    game.status = 'finished';
    game.winner = playerIndex;
    game.finishedAt = Date.now();
    await savePlayerHand(gameId, playerIndex, hand);
    await saveGameState(gameId, game);
    return { success: true, gameState: game, gameEnded: true, winner: playerIndex, penaltyApplied };
  }
  
  // Handle action cards
  if (card.value === 'skip') advanceToNextPlayer(game);
  else if (card.value === 'reverse') game.direction *= -1;
  
  advanceToNextPlayer(game);
  
  await savePlayerHand(gameId, playerIndex, hand);
  await saveGameState(gameId, game);
  
  return { success: true, gameState: game, penaltyApplied };
}

// Draw card
export async function drawCard(gameId, userId) {
  const game = await getGameState(gameId);
  if (!game) return { success: false, error: 'Game not found' };
  if (game.status !== 'playing') return { success: false, error: 'Game not in progress' };
  
  const playerIndex = game.players.findIndex(p => p.oderId === userId);
  if (playerIndex === -1) return { success: false, error: 'Player not in game' };
  if (game.currentPlayerIndex !== playerIndex) return { success: false, error: 'Not your turn' };
  
  const hand = await getPlayerHand(gameId, playerIndex);
  const drawCount = game.drawPending > 0 ? game.drawPending : 1;
  const drawnCards = drawCardsFromDeck(game, drawCount);
  hand.push(...drawnCards);
  
  game.drawPending = 0;
  game.players[playerIndex].handSize = hand.length;
  game.players[playerIndex].calledUno = false;
  game.lastMoveAt = Date.now();
  game.moveCount++;
  
  advanceToNextPlayer(game);
  
  await savePlayerHand(gameId, playerIndex, hand);
  await saveGameState(gameId, game);
  
  return { success: true, gameState: game, drawnCards: drawnCards.map(id => getCardById(id)) };
}

// Call UNO
export async function callUno(gameId, userId) {
  const game = await getGameState(gameId);
  if (!game) return { success: false, error: 'Game not found' };
  
  const playerIndex = game.players.findIndex(p => p.oderId === userId);
  if (playerIndex === -1) return { success: false, error: 'Player not in game' };
  
  const hand = await getPlayerHand(gameId, playerIndex);
  if (hand.length !== 2) return { success: false, error: 'Can only call UNO with 2 cards' };
  
  game.players[playerIndex].calledUno = true;
  await saveGameState(gameId, game);
  
  return { success: true };
}

// Bot AI
export async function executeBotTurn(gameId) {
  const game = await getGameState(gameId);
  if (!game) return { success: false, error: 'Game not found' };
  
  const currentPlayer = game.players[game.currentPlayerIndex];
  if (currentPlayer.type !== 'bot') return { success: false, error: 'Not bot turn' };
  
  const hand = await getPlayerHand(gameId, game.currentPlayerIndex);
  const topCard = getCardById(game.discardTopId);
  
  const playableCards = hand
    .map(id => ({ id, card: getCardById(id) }))
    .filter(({ card }) => canPlayCard(card, topCard, game.discardColor, game.drawPending));
  
  if (playableCards.length === 0) return drawCard(gameId, currentPlayer.oderId);
  
  const selectedCard = selectBotCard(playableCards, game, hand.length);
  let chosenColor = null;
  if (selectedCard.card.color === 'wild') chosenColor = selectBotColor(hand, game.difficulty);
  
  if (hand.length === 2) {
    const unoChance = game.difficulty === 'easy' ? 0.3 : game.difficulty === 'medium' ? 0.7 : 0.95;
    if (Math.random() < unoChance) await callUno(gameId, currentPlayer.oderId);
  }
  
  return playCard(gameId, currentPlayer.oderId, selectedCard.id, chosenColor);
}

function selectBotCard(playableCards, game, handSize) {
  if (game.difficulty === 'easy') {
    return playableCards[Math.floor(Math.random() * playableCards.length)];
  }
  
  const opponentHandSize = game.players[(game.currentPlayerIndex + 1) % 2].handSize;
  
  const scored = playableCards.map(({ id, card }) => {
    let score = Math.random() * 10;
    if (opponentHandSize <= 3) {
      if (card.value === 'wild4') score += 100;
      if (card.value === 'draw2') score += 80;
      if (card.value === 'skip' || card.value === 'reverse') score += 60;
    }
    if (handSize > 4 && card.color === 'wild') score -= 30;
    score += getCardPointValue(card) * (game.difficulty === 'hard' ? 0.5 : 0.3);
    return { id, card, score };
  });
  
  scored.sort((a, b) => b.score - a.score);
  
  if (game.difficulty === 'medium') {
    const topN = scored.slice(0, Math.min(3, scored.length));
    return topN[Math.floor(Math.random() * topN.length)];
  }
  
  return scored[0];
}

function selectBotColor(hand, difficulty) {
  if (difficulty === 'easy') return COLORS[Math.floor(Math.random() * 4)];
  
  const colorCounts = { red: 0, yellow: 0, green: 0, blue: 0 };
  hand.forEach(id => {
    const card = getCardById(id);
    if (card && card.color !== 'wild') colorCounts[card.color]++;
  });
  
  let bestColor = 'red', maxCount = 0;
  COLORS.forEach(color => {
    if (colorCounts[color] > maxCount) { maxCount = colorCounts[color]; bestColor = color; }
  });
  
  if (difficulty === 'medium' && Math.random() > 0.7) return COLORS[Math.floor(Math.random() * 4)];
  return bestColor;
}

// Finish game
export async function finishGame(gameId, userId) {
  const game = await getGameState(gameId);
  if (!game) {
    await clearActiveGame(userId);
    return { success: true, coinsAwarded: 0, streakUpdated: false, newStreak: 0 };
  }
  
  const playerIndex = game.players.findIndex(p => p.oderId === userId);
  if (playerIndex === -1) {
    await clearActiveGame(userId);
    return { success: true, coinsAwarded: 0, streakUpdated: false, newStreak: 0 };
  }
  
  const isWinner = game.winner === playerIndex;
  const opponent = game.players[(playerIndex + 1) % 2];
  const isVsHuman = opponent && opponent.type === 'human';
  const duration = Math.floor(((game.finishedAt || Date.now()) - game.createdAt) / 1000);
  
  await recordGameResult({
    oderId: userId, opponentId: opponent?.oderId || 'unknown', won: isWinner,
    difficulty: game.difficulty, duration, moveCount: game.moveCount,
    opponentType: opponent?.type || 'bot', timestamp: Date.now(),
  });
  
  const userKey = KEYS.user(userId);
  await redis.hincrby(userKey, 'gp', 1);
  
  let coinsAwarded = 0, streakUpdated = false, newStreak = 0;
  
  if (isWinner) {
    coinsAwarded = DIFFICULTY_REWARDS[game.difficulty] || 10;
    await redis.hincrby(userKey, 'w', 1);
    await redis.hincrby(userKey, 'c', coinsAwarded);
    
    if (isVsHuman) {
      const userData = await redis.hgetall(userKey);
      const currentStreak = parseInt(userData?.s || '0') + 1;
      const maxStreak = Math.max(currentStreak, parseInt(userData?.ms || '0'));
      await redis.hset(userKey, { s: currentStreak, ms: maxStreak });
      await redis.zadd(KEYS.leaderboardStreaks, { score: currentStreak, member: userId });
      streakUpdated = true;
      newStreak = currentStreak;
    }
    
    const userData = await redis.hgetall(userKey);
    await redis.zadd(KEYS.leaderboardWins, { score: parseInt(userData?.w || '0'), member: userId });
  } else {
    await redis.hincrby(userKey, 'l', 1);
    if (isVsHuman) {
      await redis.hset(userKey, { s: 0 });
      await redis.zadd(KEYS.leaderboardStreaks, { score: 0, member: userId });
    }
  }
  
  const userData = await redis.hgetall(userKey);
  await redis.zadd(KEYS.leaderboardCoins, { score: parseInt(userData?.c || '0'), member: userId });
  await redis.hset(userKey, { lg: Date.now() });
  await clearActiveGame(userId);
  
  return { success: true, coinsAwarded, streakUpdated, newStreak };
}
