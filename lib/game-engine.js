// lib/game-engine.js
import { redis, KEYS, TTL, COLORS, DIFFICULTY_REWARDS } from './redis';
import { 
  generateId, gameToRedis, gameFromRedis, recordGameResult 
} from './utils';

// ============ UNO DECK GENERATION ============
const NUMBER_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const ACTION_VALUES = ['skip', 'reverse', 'draw2'];

// Pre-generate the deck lookup table (108 cards)
function generateDeckLookup() {
  const deck = [];
  let id = 0;
  
  // For each color
  COLORS.forEach(color => {
    // One 0
    deck.push({ color, value: '0', id: id++ });
    
    // Two of each 1-9
    NUMBER_VALUES.slice(1).forEach(value => {
      deck.push({ color, value, id: id++ });
      deck.push({ color, value, id: id++ });
    });
    
    // Two of each action card
    ACTION_VALUES.forEach(value => {
      deck.push({ color, value, id: id++ });
      deck.push({ color, value, id: id++ });
    });
  });
  
  // Four wild cards
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild', id: id++ });
  }
  
  // Four wild draw 4 cards
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild4', id: id++ });
  }
  
  return deck; // 108 cards total
}

const DECK_LOOKUP = generateDeckLookup();

export function getCardById(id) {
  return DECK_LOOKUP[id] || null;
}

export function createDeck() {
  return [...DECK_LOOKUP];
}

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
  if (['skip', 'reverse', 'draw2'].includes(card.value)) return 20;
  return parseInt(card.value) || 0;
}

// ============ BOT NAMES ============
const BOT_NAMES = {
  easy: ['Rookie Bot', 'Beginner Bot', 'Learning Bot', 'Newbie Bot'],
  medium: ['Smart Bot', 'Clever Bot', 'Skilled Bot', 'Sharp Bot'],
  hard: ['Expert Bot', 'Master Bot', 'Pro Bot', 'Elite Bot'],
};

function getBotName(difficulty) {
  const names = BOT_NAMES[difficulty] || BOT_NAMES.easy;
  return names[Math.floor(Math.random() * names.length)];
}

// ============ GAME CREATION ============
export async function createGame(hostUserId, hostName, difficulty, vsBot = false) {
  const gameId = generateId('g');
  const now = Date.now();
  
  // Create and shuffle deck
  const deck = shuffleArray(createDeck());
  const deckIds = deck.map(c => c.id);
  
  // Deal initial hands (7 cards each)
  const hostHandIds = deckIds.splice(0, 7);
  const opponentHandIds = vsBot ? deckIds.splice(0, 7) : [];
  
  // Find valid starting card (not wild or action)
  let startCardIndex = 0;
  while (startCardIndex < deckIds.length) {
    const card = getCardById(deckIds[startCardIndex]);
    if (card && card.color !== 'wild' && !['skip', 'reverse', 'draw2'].includes(card.value)) {
      break;
    }
    startCardIndex++;
  }
  
  const discardTopId = deckIds.splice(startCardIndex, 1)[0];
  const discardCard = getCardById(discardTopId);
  
  // Create players
  const players = [
    {
      order: 0,
      oderId: hostUserId,
      name: hostName,
      type: 'human',
      handSize: 7,
      calledUno: false,
      connected: true,
    }
  ];
  
  if (vsBot) {
    players.push({
      order: 1,
      oderId: `bot_${difficulty}_${gameId}`,
      name: getBotName(difficulty),
      type: 'bot',
      handSize: 7,
      calledUno: false,
      connected: true,
    });
  }
  
  const gameState = {
    id: gameId,
    status: vsBot ? 'playing' : 'waiting',
    difficulty,
    players,
    currentPlayerIndex: 0,
    direction: 1,
    deckIds,
    discardTopId,
    discardColor: discardCard.color,
    drawPending: 0,
    createdAt: now,
    lastMoveAt: now,
    moveCount: 0,
  };
  
  // Store game state
  await redis.hset(KEYS.game(gameId), gameToRedis(gameState));
  await redis.expire(KEYS.game(gameId), TTL.game);
  
  // Store player hands
  await redis.set(KEYS.gameHand(gameId, 0), hostHandIds.join(','), { ex: TTL.game });
  if (vsBot) {
    await redis.set(KEYS.gameHand(gameId, 1), opponentHandIds.join(','), { ex: TTL.game });
  }
  
  // Mark user as in a game
  await redis.set(KEYS.userActiveGame(hostUserId), gameId, { ex: TTL.game });
  
  return gameState;
}

export async function joinGame(gameId, oderId, userName) {
  const gameData = await redis.hgetall(KEYS.game(gameId));
  
  if (!gameData || Object.keys(gameData).length === 0) {
    return { success: false, error: 'Game not found' };
  }
  
  const game = gameFromRedis(gameData);
  
  if (game.status !== 'waiting') {
    return { success: false, error: 'Game already started or finished' };
  }
  
  if (game.players.length >= 2) {
    return { success: false, error: 'Game is full' };
  }
  
  if (game.players[0].oderId === oderId) {
    return { success: false, error: 'Cannot join your own game' };
  }
  
  // Deal cards to joining player
  const deckIds = [...game.deckIds];
  const joinHandIds = deckIds.splice(0, 7);
  
  // Add player
  game.players.push({
    order: 1,
    oderId,
    name: userName,
    type: 'human',
    handSize: 7,
    calledUno: false,
    connected: true,
  });
  
  game.deckIds = deckIds;
  game.status = 'playing';
  
  // Update game state
  await redis.hset(KEYS.game(gameId), gameToRedis(game));
  await redis.set(KEYS.gameHand(gameId, 1), joinHandIds.join(','), { ex: TTL.game });
  await redis.set(KEYS.userActiveGame(oderId), gameId, { ex: TTL.game });
  
  return { success: true, gameState: game };
}

// ============ GAME STATE HELPERS ============
export async function getGameState(gameId) {
  const gameData = await redis.hgetall(KEYS.game(gameId));
  if (!gameData || Object.keys(gameData).length === 0) return null;
  return gameFromRedis(gameData);
}

export async function getPlayerHand(gameId, playerIndex) {
  const handStr = await redis.get(KEYS.gameHand(gameId, playerIndex));
  if (!handStr) return [];
  return handStr.split(',').map(Number);
}

async function saveGameState(gameId, game) {
  await redis.hset(KEYS.game(gameId), gameToRedis(game));
  await redis.expire(KEYS.game(gameId), TTL.game);
}

async function savePlayerHand(gameId, playerIndex, hand) {
  await redis.set(KEYS.gameHand(gameId, playerIndex), hand.join(','), { ex: TTL.game });
}

// ============ GAME LOGIC ============
export function canPlayCard(card, topCard, currentColor, drawPending) {
  // If there's a draw pending, only +2 or +4 can be played (stacking)
  if (drawPending > 0) {
    if (topCard.value === 'draw2') {
      return card.value === 'draw2' || card.value === 'wild4';
    }
    if (topCard.value === 'wild4') {
      return card.value === 'wild4';
    }
  }
  
  // Wild cards can always be played
  if (card.color === 'wild') return true;
  
  // Match color or value
  return card.color === currentColor || card.value === topCard.value;
}

function drawCardsFromDeck(game, count) {
  const drawn = [];
  
  for (let i = 0; i < count; i++) {
    if (game.deckIds.length === 0) {
      // Reshuffle - generate random unused card IDs
      const usedIds = new Set([game.discardTopId, ...drawn]);
      const availableIds = Array.from({ length: 108 }, (_, i) => i)
        .filter(id => !usedIds.has(id));
      game.deckIds = shuffleArray(availableIds);
    }
    
    if (game.deckIds.length > 0) {
      drawn.push(game.deckIds.shift());
    }
  }
  
  return drawn;
}

function advanceToNextPlayer(game) {
  game.currentPlayerIndex = (game.currentPlayerIndex + game.direction + 2) % 2;
}

// ============ PLAY CARD ============
export async function playCard(gameId, oderId, cardId, chosenColor = null) {
  const game = await getGameState(gameId);
  if (!game) return { success: false, error: 'Game not found' };
  
  if (game.status !== 'playing') {
    return { success: false, error: 'Game is not in progress' };
  }
  
  // Verify it's the player's turn
  const currentPlayer = game.players[game.currentPlayerIndex];
  if (currentPlayer.oderId !== oderId) {
    return { success: false, error: 'Not your turn' };
  }
  
  // Get player's hand
  const hand = await getPlayerHand(gameId, game.currentPlayerIndex);
  
  // Verify player has the card
  if (!hand.includes(cardId)) {
    return { success: false, error: 'Card not in hand' };
  }
  
  // Validate the card can be played
  const card = getCardById(cardId);
  if (!card) return { success: false, error: 'Invalid card' };
  
  const topCard = getCardById(game.discardTopId);
  if (!topCard) return { success: false, error: 'Invalid game state' };
  
  if (!canPlayCard(card, topCard, game.discardColor, game.drawPending)) {
    return { success: false, error: 'Cannot play this card' };
  }
  
  // Validate wild card color choice
  if (card.color === 'wild' && !chosenColor) {
    return { success: false, error: 'Must choose a color for wild card' };
  }
  
  if (card.color !== 'wild' && chosenColor) {
    return { success: false, error: 'Cannot choose color for non-wild card' };
  }
  
  if (chosenColor && !COLORS.includes(chosenColor)) {
    return { success: false, error: 'Invalid color choice' };
  }
  
  // Apply card effect
  const now = Date.now();
  let penaltyApplied = null;
  
  // Remove card from hand
  let newHand = hand.filter(id => id !== cardId);
  
  // Update discard
  game.discardTopId = cardId;
  game.discardColor = chosenColor || card.color;
  
  // Handle special cards
  switch (card.value) {
    case 'skip':
    case 'reverse':
      // In 2-player, reverse acts as skip
      break;
      
    case 'draw2':
      game.drawPending += 2;
      break;
      
    case 'wild4':
      game.drawPending += 4;
      break;
  }
  
  // Check UNO call penalty
  if (newHand.length === 1 && !currentPlayer.calledUno) {
    penaltyApplied = 'UNO penalty: +2 cards';
    const drawnCards = drawCardsFromDeck(game, 2);
    newHand = [...newHand, ...drawnCards];
  }
  
  // Update hand size in game state
  game.players[game.currentPlayerIndex].handSize = newHand.length;
  game.players[game.currentPlayerIndex].calledUno = false;
  
  // Save hand
  await savePlayerHand(gameId, game.currentPlayerIndex, newHand);
  
  // Check for win
  if (newHand.length === 0) {
    game.status = 'finished';
    game.winner = game.currentPlayerIndex;
    game.finishedAt = now;
    
    await saveGameState(gameId, game);
    
    return {
      success: true,
      gameState: game,
      gameEnded: true,
      winner: game.currentPlayerIndex,
      penaltyApplied,
    };
  }
  
  // Move to next player (skip/reverse don't advance in 2-player)
  if (card.value !== 'skip' && card.value !== 'reverse') {
    advanceToNextPlayer(game);
  }
  // For skip/reverse in 2-player, stay on same player's turn
  // But actually in UNO rules, skip skips the next player, so current player plays again
  // Let's follow standard rules - advance after skip/reverse since it skips opponent
  else {
    // Skip/reverse: skip opponent, current player doesn't change (effectively)
    // In 2-player this means current player goes again
  }
  
  game.lastMoveAt = now;
  game.moveCount++;
  
  await saveGameState(gameId, game);
  
  return {
    success: true,
    gameState: game,
    penaltyApplied,
  };
}

// ============ DRAW CARD ============
export async function drawCard(gameId, oderId) {
  const game = await getGameState(gameId);
  if (!game) return { success: false, error: 'Game not found' };
  
  if (game.status !== 'playing') {
    return { success: false, error: 'Game is not in progress' };
  }
  
  const currentPlayer = game.players[game.currentPlayerIndex];
  if (currentPlayer.oderId !== oderId) {
    return { success: false, error: 'Not your turn' };
  }
  
  const hand = await getPlayerHand(gameId, game.currentPlayerIndex);
  
  // If there's a draw pending, must draw that many
  const drawCount = game.drawPending > 0 ? game.drawPending : 1;
  
  // Draw cards
  const drawnCardIds = drawCardsFromDeck(game, drawCount);
  const newHand = [...hand, ...drawnCardIds];
  
  // Reset draw pending
  game.drawPending = 0;
  
  // Update hand size
  game.players[game.currentPlayerIndex].handSize = newHand.length;
  
  // Save hand
  await savePlayerHand(gameId, game.currentPlayerIndex, newHand);
  
  // Advance to next player
  advanceToNextPlayer(game);
  game.lastMoveAt = Date.now();
  game.moveCount++;
  
  await saveGameState(gameId, game);
  
  const drawnCards = drawnCardIds.map(id => getCardById(id));
  
  return {
    success: true,
    drawnCards,
    gameState: game,
    mustDraw: drawCount > 1 ? drawCount : undefined,
  };
}

// ============ CALL UNO ============
export async function callUno(gameId, oderId) {
  const game = await getGameState(gameId);
  if (!game) return { success: false, error: 'Game not found' };
  
  const playerIndex = game.players.findIndex(p => p.oderId === oderId);
  if (playerIndex === -1) {
    return { success: false, error: 'Player not in game' };
  }
  
  const hand = await getPlayerHand(gameId, playerIndex);
  if (hand.length !== 2) {
    return { success: false, error: 'Can only call UNO with 2 cards' };
  }
  
  game.players[playerIndex].calledUno = true;
  await saveGameState(gameId, game);
  
  return { success: true };
}

// ============ CATCH UNO FAILURE ============
export async function catchUnoFailure(gameId, catcherUserId, targetPlayerIndex) {
  const game = await getGameState(gameId);
  if (!game) return { success: false, error: 'Game not found' };
  
  const catcherIndex = game.players.findIndex(p => p.oderId === catcherUserId);
  if (catcherIndex === -1) {
    return { success: false, error: 'Catcher not in game' };
  }
  
  if (catcherIndex === targetPlayerIndex) {
    return { success: false, error: 'Cannot catch yourself' };
  }
  
  const targetHand = await getPlayerHand(gameId, targetPlayerIndex);
  const targetPlayer = game.players[targetPlayerIndex];
  
  if (targetHand.length !== 1) {
    return { success: false, error: 'Target does not have exactly 1 card' };
  }
  
  if (targetPlayer.calledUno) {
    return { success: false, error: 'Target already called UNO' };
  }
  
  // Apply penalty
  const penaltyCards = drawCardsFromDeck(game, 2);
  const newHand = [...targetHand, ...penaltyCards];
  
  game.players[targetPlayerIndex].handSize = newHand.length;
  
  await savePlayerHand(gameId, targetPlayerIndex, newHand);
  await saveGameState(gameId, game);
  
  return { success: true, penalty: true };
}

// ============ BOT AI ============
export async function executeBotTurn(gameId) {
  const game = await getGameState(gameId);
  if (!game) return { success: false, error: 'Game not found' };
  
  const currentPlayer = game.players[game.currentPlayerIndex];
  if (currentPlayer.type !== 'bot') {
    return { success: false, error: 'Not bot turn' };
  }
  
  const hand = await getPlayerHand(gameId, game.currentPlayerIndex);
  const topCard = getCardById(game.discardTopId);
  
  // Find playable cards
  const playableCards = hand
    .map(id => ({ id, card: getCardById(id) }))
    .filter(({ card }) => canPlayCard(card, topCard, game.discardColor, game.drawPending));
  
  // Must draw if no playable cards
  if (playableCards.length === 0) {
    return drawCard(gameId, currentPlayer.oderId);
  }
  
  // Bot AI: Select card based on difficulty
  const selectedCard = selectBotCard(playableCards, game, hand.length);
  
  // Choose color for wild cards
  let chosenColor = null;
  if (selectedCard.card.color === 'wild') {
    chosenColor = selectBotColor(hand, game.difficulty);
  }
  
  // Call UNO if going to 1 card
  if (hand.length === 2) {
    const unoChance = game.difficulty === 'easy' ? 0.3 
                    : game.difficulty === 'medium' ? 0.7 
                    : 0.95;
    
    if (Math.random() < unoChance) {
      await callUno(gameId, currentPlayer.oderId);
    }
  }
  
  return playCard(gameId, currentPlayer.oderId, selectedCard.id, chosenColor);
}

function selectBotCard(playableCards, game, handSize) {
  const { difficulty } = game;
  
  // Easy: Random selection
  if (difficulty === 'easy') {
    return playableCards[Math.floor(Math.random() * playableCards.length)];
  }
  
  const opponentHandSize = game.players[(game.currentPlayerIndex + 1) % 2].handSize;
  
  // Score each card
  const scored = playableCards.map(({ id, card }) => {
    let score = Math.random() * 10;
    
    // Prefer action cards when opponent has few cards
    if (opponentHandSize <= 3) {
      if (card.value === 'wild4') score += 100;
      if (card.value === 'draw2') score += 80;
      if (card.value === 'skip' || card.value === 'reverse') score += 60;
    }
    
    // Save wilds for later
    if (handSize > 4 && card.color === 'wild') {
      score -= 30;
    }
    
    // Prefer playing high-value cards
    score += getCardPointValue(card) * (difficulty === 'hard' ? 0.5 : 0.3);
    
    return { id, card, score };
  });
  
  scored.sort((a, b) => b.score - a.score);
  
  // Medium: Pick from top 3
  if (difficulty === 'medium') {
    const topN = scored.slice(0, Math.min(3, scored.length));
    return topN[Math.floor(Math.random() * topN.length)];
  }
  
  // Hard: Usually pick best
  if (Math.random() > 0.85 && scored.length >= 2) {
    return scored[1];
  }
  return scored[0];
}

function selectBotColor(hand, difficulty) {
  if (difficulty === 'easy') {
    return COLORS[Math.floor(Math.random() * 4)];
  }
  
  // Count colors in hand
  const colorCounts = { red: 0, yellow: 0, green: 0, blue: 0 };
  hand.forEach(id => {
    const card = getCardById(id);
    if (card && card.color !== 'wild') {
      colorCounts[card.color]++;
    }
  });
  
  // Pick color with most cards
  let bestColor = 'red';
  let maxCount = 0;
  
  COLORS.forEach(color => {
    if (colorCounts[color] > maxCount) {
      maxCount = colorCounts[color];
      bestColor = color;
    }
  });
  
  // Medium: Sometimes pick suboptimal
  if (difficulty === 'medium' && Math.random() > 0.7) {
    return COLORS[Math.floor(Math.random() * 4)];
  }
  
  return bestColor;
}

// ============ FINISH GAME & REWARDS ============
export async function finishGame(gameId, oderId) {
  const game = await getGameState(gameId);
  if (!game) return { success: false, error: 'Game not found' };
  
  if (game.status !== 'finished') {
    return { success: false, error: 'Game not finished' };
  }
  
  const playerIndex = game.players.findIndex(p => p.oderId === oderId);
  if (playerIndex === -1) {
    return { success: false, error: 'User not in game' };
  }
  
  const isWinner = game.winner === playerIndex;
  const opponent = game.players[(playerIndex + 1) % 2];
  const isVsHuman = opponent.type === 'human';
  
  // Calculate game duration
  const duration = Math.floor((game.finishedAt - game.createdAt) / 1000);
  
  // Record game result for anti-abuse
  await recordGameResult({
    oderId,
    opponentId: opponent.oderId,
    won: isWinner,
    difficulty: game.difficulty,
    duration,
    moveCount: game.moveCount,
    opponentType: opponent.type,
    timestamp: Date.now(),
  });
  
  const userKey = KEYS.user(oderId);
  
  // Increment games played
  await redis.hincrby(userKey, 'gp', 1);
  
  let coinsAwarded = 0;
  let streakUpdated = false;
  let newStreak = 0;
  
  if (isWinner) {
    // Award coins
    coinsAwarded = DIFFICULTY_REWARDS[game.difficulty];
    await redis.hincrby(userKey, 'w', 1);
    await redis.hincrby(userKey, 'c', coinsAwarded);
    
    // Update streak (only vs humans)
    if (isVsHuman) {
      const userData = await redis.hgetall(userKey);
      const currentStreak = parseInt(userData?.s || '0') + 1;
      const maxStreak = Math.max(currentStreak, parseInt(userData?.ms || '0'));
      
      await redis.hset(userKey, { s: currentStreak, ms: maxStreak });
      await redis.zadd(KEYS.leaderboardStreaks, { score: currentStreak, member: oderId });
      
      streakUpdated = true;
      newStreak = currentStreak;
    }
    
    // Update wins leaderboard
    const userData = await redis.hgetall(userKey);
    const totalWins = parseInt(userData?.w || '0');
    await redis.zadd(KEYS.leaderboardWins, { score: totalWins, member: oderId });
    
  } else {
    // Loss
    await redis.hincrby(userKey, 'l', 1);
    
    // Reset streak if vs human
    if (isVsHuman) {
      await redis.hset(userKey, { s: 0 });
      await redis.zadd(KEYS.leaderboardStreaks, { score: 0, member: oderId });
    }
  }
  
  // Update coins leaderboard
  const userData = await redis.hgetall(userKey);
  const totalCoins = parseInt(userData?.c || '0');
  await redis.zadd(KEYS.leaderboardCoins, { score: totalCoins, member: oderId });
  
  // Update last game timestamp
  await redis.hset(userKey, { lg: Date.now() });
  
  // Clean up user active game
  await redis.del(KEYS.userActiveGame(oderId));
  
  return {
    success: true,
    coinsAwarded,
    streakUpdated,
    newStreak,
  };
}
