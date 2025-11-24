// api/socket.js - Vercel Serverless WebSocket Handler with MongoDB
import { Server } from "socket.io";
import { MongoClient } from "mongodb";

// MongoDB client
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = await MongoClient.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const db = client.db("uno-multiplayer");

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

// Helper functions for MongoDB operations
async function getRoom(roomCode) {
  const { db } = await connectToDatabase();
  return await db.collection("rooms").findOne({ roomCode });
}

async function setRoom(roomCode, roomData) {
  const { db } = await connectToDatabase();
  return await db.collection("rooms").updateOne(
    { roomCode },
    {
      $set: {
        ...roomData,
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
      },
    },
    { upsert: true }
  );
}

async function deleteRoom(roomCode) {
  const { db } = await connectToDatabase();
  return await db.collection("rooms").deleteOne({ roomCode });
}

async function getAllActiveRooms() {
  const { db } = await connectToDatabase();
  return await db
    .collection("rooms")
    .find({ expiresAt: { $gt: new Date() } })
    .toArray();
}

async function cleanupExpiredRooms() {
  const { db } = await connectToDatabase();
  return await db.collection("rooms").deleteMany({
    expiresAt: { $lt: new Date() },
  });
}

// Game logic classes
class GameRoom {
  constructor(roomCode, hostId, hostName) {
    this.roomCode = roomCode;
    this.hostId = hostId;
    this.players = [
      {
        id: hostId,
        name: hostName,
        hand: [],
        isReady: false,
        isHost: true,
      },
    ];
    this.maxPlayers = 4;
    this.gameState = "waiting"; // waiting, playing, finished
    this.deck = [];
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.direction = 1; // 1 for clockwise, -1 for counter-clockwise
    this.drawPending = 0;
    this.createdAt = new Date();
    this.lastActivity = new Date();
    this.expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  }

  addPlayer(playerId, playerName) {
    if (this.players.length >= this.maxPlayers) {
      return { success: false, message: "Room is full" };
    }

    if (this.gameState !== "waiting") {
      return { success: false, message: "Game already started" };
    }

    // Check if player already exists
    if (this.players.some((p) => p.id === playerId)) {
      return { success: false, message: "You are already in this room" };
    }

    this.players.push({
      id: playerId,
      name: playerName,
      hand: [],
      isReady: false,
      isHost: false,
    });

    this.lastActivity = new Date();
    return { success: true };
  }

  removePlayer(playerId) {
    const index = this.players.findIndex((p) => p.id === playerId);
    if (index !== -1) {
      this.players.splice(index, 1);

      // If host leaves, assign new host
      if (this.players.length > 0 && !this.players.some((p) => p.isHost)) {
        this.players[0].isHost = true;
        this.hostId = this.players[0].id;
      }
    }
    this.lastActivity = new Date();
  }

  allPlayersReady() {
    return this.players.length >= 2 && this.players.every((p) => p.isReady);
  }

  toJSON() {
    return {
      roomCode: this.roomCode,
      hostId: this.hostId,
      players: this.players,
      maxPlayers: this.maxPlayers,
      gameState: this.gameState,
      deck: this.deck,
      discardPile: this.discardPile,
      currentPlayerIndex: this.currentPlayerIndex,
      direction: this.direction,
      drawPending: this.drawPending,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      expiresAt: this.expiresAt,
    };
  }

  static fromJSON(data) {
    const room = new GameRoom(data.roomCode, data.hostId, "");
    Object.assign(room, data);
    // Convert date strings back to Date objects
    room.createdAt = new Date(data.createdAt);
    room.lastActivity = new Date(data.lastActivity);
    room.expiresAt = new Date(data.expiresAt);
    return room;
  }
}

// Utility functions
function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function createDeck() {
  const colors = ["red", "yellow", "green", "blue"];
  const deck = [];

  colors.forEach((color) => {
    deck.push({ color, value: "0", id: Math.random() });
    for (let i = 1; i <= 9; i++) {
      deck.push({ color, value: String(i), id: Math.random() });
      deck.push({ color, value: String(i), id: Math.random() });
    }
    ["skip", "reverse", "draw2"].forEach((action) => {
      deck.push({ color, value: action, id: Math.random() });
      deck.push({ color, value: action, id: Math.random() });
    });
  });

  for (let i = 0; i < 4; i++) {
    deck.push({ color: "wild", value: "wild", id: Math.random() });
    deck.push({ color: "wild", value: "wild4", id: Math.random() });
  }

  return shuffleArray(deck);
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function canPlayCard(card, topCard) {
  if (card.color === "wild") return true;
  if (topCard.color === "wild") return true;
  return card.color === topCard.color || card.value === topCard.value;
}

function drawCards(room, count) {
  const cards = [];
  for (let i = 0; i < count; i++) {
    if (room.deck.length === 0 && room.discardPile.length > 1) {
      const topCard = room.discardPile.pop();
      room.deck = shuffleArray(room.discardPile);
      room.discardPile = [topCard];
    }
    if (room.deck.length > 0) {
      cards.push(room.deck.shift());
    }
  }
  return cards;
}

function handleSpecialCard(room, card) {
  switch (card.value) {
    case "skip":
      room.currentPlayerIndex = getNextPlayerIndex(room);
      break;
    case "reverse":
      room.direction *= -1;
      if (room.players.length === 2) {
        room.currentPlayerIndex = getNextPlayerIndex(room);
      }
      break;
    case "draw2":
      room.drawPending += 2;
      break;
    case "wild4":
      room.drawPending += 4;
      break;
  }
}

function getNextPlayerIndex(room) {
  let next = room.currentPlayerIndex + room.direction;
  if (next >= room.players.length) next = 0;
  if (next < 0) next = room.players.length - 1;
  return next;
}

function sanitizeRoom(room, currentPlayerId) {
  return {
    ...room,
    players: room.players.map((p) => ({
      ...p,
      hand: p.id === currentPlayerId ? p.hand : [],
      handSize: p.hand.length,
    })),
    deck: room.deck.length,
  };
}

async function startGame(room, roomCode, io) {
  room.gameState = "playing";
  room.deck = createDeck();

  room.players.forEach((player) => {
    player.hand = room.deck.splice(0, 7);
  });

  let firstCard = room.deck.splice(0, 1)[0];
  while (
    firstCard.color === "wild" ||
    ["skip", "reverse", "draw2"].includes(firstCard.value)
  ) {
    room.deck.push(firstCard);
    room.deck = shuffleArray(room.deck);
    firstCard = room.deck.splice(0, 1)[0];
  }
  room.discardPile = [firstCard];
  room.currentPlayerIndex = Math.floor(Math.random() * room.players.length);

  await setRoom(roomCode, room.toJSON());

  // Send personalized game state to each player
  room.players.forEach((player) => {
    io.to(player.id).emit("game-started", {
      room: sanitizeRoom(room, player.id),
    });
  });

  console.log(`🎮 Game started in room: ${roomCode}`);
}

// Socket.IO handler
export default async function handler(req, res) {
  // Initialize MongoDB connection
  await connectToDatabase();

  if (!res.socket.server.io) {
    console.log("🚀 Initializing Socket.IO server...");

    const io = new Server(res.socket.server, {
      path: "/api/socket",
      addTrailingSlash: false,
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    // Cleanup expired rooms every 10 minutes
    setInterval(async () => {
      try {
        const result = await cleanupExpiredRooms();
        if (result.deletedCount > 0) {
          console.log(`🧹 Cleaned up ${result.deletedCount} expired rooms`);
        }
      } catch (error) {
        console.error("Error cleaning up rooms:", error);
      }
    }, 10 * 60 * 1000);

    io.on("connection", (socket) => {
      console.log(`👤 Player connected: ${socket.id}`);

      // Create room
      socket.on("create-room", async (data) => {
        try {
          const { playerName } = data;
          let roomCode = generateRoomCode();

          // Ensure unique room code
          let existingRoom = await getRoom(roomCode);
          while (existingRoom) {
            roomCode = generateRoomCode();
            existingRoom = await getRoom(roomCode);
          }

          const newRoom = new GameRoom(roomCode, socket.id, playerName);
          await setRoom(roomCode, newRoom.toJSON());

          socket.join(roomCode);

          socket.emit("room-created", {
            roomCode,
            room: newRoom.toJSON(),
          });

          console.log(`🎮 Room created: ${roomCode} by ${playerName}`);
        } catch (error) {
          console.error("❌ Error creating room:", error);
          socket.emit("error", { message: "Failed to create room" });
        }
      });

      // Join room
      socket.on("join-room", async (data) => {
        try {
          const { roomCode, playerName } = data;
          const roomData = await getRoom(roomCode);

          if (!roomData) {
            socket.emit("error", { message: "Room not found" });
            return;
          }

          const room = GameRoom.fromJSON(roomData);
          const result = room.addPlayer(socket.id, playerName);

          if (!result.success) {
            socket.emit("error", { message: result.message });
            return;
          }

          await setRoom(roomCode, room.toJSON());
          socket.join(roomCode);

          socket.emit("room-joined", { room: room.toJSON() });

          io.to(roomCode).emit("player-joined", {
            player: room.players[room.players.length - 1],
            room: room.toJSON(),
          });

          console.log(`👋 ${playerName} joined room: ${roomCode}`);
        } catch (error) {
          console.error("❌ Error joining room:", error);
          socket.emit("error", { message: "Failed to join room" });
        }
      });

      // Player ready
      socket.on("player-ready", async (data) => {
        try {
          const { roomCode } = data;
          const roomData = await getRoom(roomCode);

          if (!roomData) return;

          const room = GameRoom.fromJSON(roomData);
          const player = room.players.find((p) => p.id === socket.id);

          if (player) {
            player.isReady = true;
            await setRoom(roomCode, room.toJSON());

            io.to(roomCode).emit("player-ready-update", {
              playerId: socket.id,
              room: room.toJSON(),
            });

            if (room.allPlayersReady()) {
              await startGame(room, roomCode, io);
            }
          }
        } catch (error) {
          console.error("❌ Error setting ready:", error);
        }
      });

      // Play card
      socket.on("play-card", async (data) => {
        try {
          const { roomCode, card, chosenColor } = data;
          const roomData = await getRoom(roomCode);

          if (!roomData || roomData.gameState !== "playing") return;

          const room = GameRoom.fromJSON(roomData);
          const currentPlayer = room.players[room.currentPlayerIndex];

          if (currentPlayer.id !== socket.id) {
            socket.emit("error", { message: "Not your turn!" });
            return;
          }

          const topCard = room.discardPile[room.discardPile.length - 1];

          // Check for stacking
          if (room.drawPending > 0) {
            const canStack =
              (card.value === "draw2" && topCard.value === "draw2") ||
              (card.value === "wild4" &&
                (topCard.value === "wild4" || topCard.value === "draw2"));

            if (!canStack) {
              socket.emit("error", {
                message: `Must draw ${room.drawPending} cards or stack!`,
              });
              return;
            }
          } else if (!canPlayCard(card, topCard)) {
            socket.emit("error", { message: "Invalid card" });
            return;
          }

          const cardIndex = currentPlayer.hand.findIndex(
            (c) => c.id === card.id
          );
          if (cardIndex !== -1) {
            currentPlayer.hand.splice(cardIndex, 1);
          }

          const playedCard = chosenColor
            ? { ...card, color: chosenColor }
            : card;
          room.discardPile.push(playedCard);

          handleSpecialCard(room, card);

          // Check for winner
          if (currentPlayer.hand.length === 0) {
            room.gameState = "finished";
            await setRoom(roomCode, room.toJSON());

            io.to(roomCode).emit("game-over", {
              winner: currentPlayer,
              room: room.toJSON(),
            });

            console.log(`🏆 ${currentPlayer.name} won in room: ${roomCode}`);
            return;
          }

          room.currentPlayerIndex = getNextPlayerIndex(room);
          await setRoom(roomCode, room.toJSON());

          // Send personalized updates
          room.players.forEach((player) => {
            io.to(player.id).emit("game-updated", {
              room: sanitizeRoom(room, player.id),
              action: "card-played",
              player: currentPlayer.name,
              card: playedCard,
            });
          });

          console.log(
            `🃏 ${currentPlayer.name} played ${playedCard.value} ${playedCard.color}`
          );
        } catch (error) {
          console.error("❌ Error playing card:", error);
          socket.emit("error", { message: "Failed to play card" });
        }
      });

      // Draw card
      socket.on("draw-card", async (data) => {
        try {
          const { roomCode } = data;
          const roomData = await getRoom(roomCode);

          if (!roomData || roomData.gameState !== "playing") return;

          const room = GameRoom.fromJSON(roomData);
          const currentPlayer = room.players[room.currentPlayerIndex];

          if (currentPlayer.id !== socket.id) return;

          const count = room.drawPending > 0 ? room.drawPending : 1;
          const drawnCards = drawCards(room, count);
          currentPlayer.hand.push(...drawnCards);

          if (room.drawPending > 0) {
            room.drawPending = 0;
            room.currentPlayerIndex = getNextPlayerIndex(room);
          }

          await setRoom(roomCode, room.toJSON());

          room.players.forEach((player) => {
            io.to(player.id).emit("game-updated", {
              room: sanitizeRoom(room, player.id),
              action: "card-drawn",
              player: currentPlayer.name,
              count,
            });
          });

          console.log(`📥 ${currentPlayer.name} drew ${count} card(s)`);
        } catch (error) {
          console.error("❌ Error drawing card:", error);
        }
      });

      // End turn (after drawing)
      socket.on("end-turn", async (data) => {
        try {
          const { roomCode } = data;
          const roomData = await getRoom(roomCode);

          if (!roomData || roomData.gameState !== "playing") return;

          const room = GameRoom.fromJSON(roomData);
          const currentPlayer = room.players[room.currentPlayerIndex];

          if (currentPlayer.id !== socket.id) return;

          room.currentPlayerIndex = getNextPlayerIndex(room);
          await setRoom(roomCode, room.toJSON());

          room.players.forEach((player) => {
            io.to(player.id).emit("game-updated", {
              room: sanitizeRoom(room, player.id),
              action: "turn-ended",
              player: currentPlayer.name,
            });
          });

          console.log(`⏭️ ${currentPlayer.name} ended turn`);
        } catch (error) {
          console.error("❌ Error ending turn:", error);
        }
      });

      // Call UNO
      socket.on("call-uno", async (data) => {
        try {
          const { roomCode } = data;
          const roomData = await getRoom(roomCode);

          if (!roomData) return;

          const room = GameRoom.fromJSON(roomData);
          const player = room.players.find((p) => p.id === socket.id);

          io.to(roomCode).emit("uno-called", {
            playerId: socket.id,
            playerName: player?.name,
          });

          console.log(`🎵 ${player?.name} called UNO!`);
        } catch (error) {
          console.error("❌ Error calling UNO:", error);
        }
      });

      // Chat message
      socket.on("chat-message", async (data) => {
        try {
          const { roomCode, message } = data;
          const roomData = await getRoom(roomCode);

          if (!roomData) return;

          const room = GameRoom.fromJSON(roomData);
          const player = room.players.find((p) => p.id === socket.id);

          io.to(roomCode).emit("chat-message", {
            playerId: socket.id,
            playerName: player?.name || "Unknown",
            message,
            timestamp: Date.now(),
          });

          console.log(`💬 ${player?.name}: ${message}`);
        } catch (error) {
          console.error("❌ Error sending chat:", error);
        }
      });

      // Leave room
      socket.on("leave-room", async (data) => {
        try {
          const { roomCode } = data;
          await handlePlayerDisconnect(socket.id, roomCode, io);
        } catch (error) {
          console.error("❌ Error leaving room:", error);
        }
      });

      // Disconnect
      socket.on("disconnect", async () => {
        console.log(`👋 Player disconnected: ${socket.id}`);

        try {
          const rooms = await getAllActiveRooms();
          for (const roomData of rooms) {
            const room = GameRoom.fromJSON(roomData);
            if (room.players.some((p) => p.id === socket.id)) {
              await handlePlayerDisconnect(socket.id, room.roomCode, io);
            }
          }
        } catch (error) {
          console.error("❌ Error handling disconnect:", error);
        }
      });

      async function handlePlayerDisconnect(playerId, roomCode, io) {
        const roomData = await getRoom(roomCode);
        if (!roomData) return;

        const room = GameRoom.fromJSON(roomData);
        const player = room.players.find((p) => p.id === playerId);
        const playerName = player?.name || "Unknown";

        room.removePlayer(playerId);

        if (room.players.length === 0) {
          await deleteRoom(roomCode);
          console.log(`🗑️ Room deleted: ${roomCode}`);
        } else {
          await setRoom(roomCode, room.toJSON());
          io.to(roomCode).emit("player-left", {
            playerId,
            playerName,
            room: room.toJSON(),
          });
          console.log(`👋 ${playerName} left room: ${roomCode}`);
        }
      }
    });

    res.socket.server.io = io;
    console.log("✅ Socket.IO server initialized");
  }

  res.end();
}
