// hooks/useMultiplayer.js
import { useEffect, useRef, useState, useCallback } from "react";
import io from "socket.io-client";

// Use environment variable or default to localhost
const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3000";

export function useMultiplayer() {
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [currentPlayerId, setCurrentPlayerId] = useState(null);

  const socketRef = useRef(null);

  useEffect(() => {
    // Connect to Vercel serverless WebSocket
    socketRef.current = io(SOCKET_URL, {
      path: "/api/socket",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    const socket = socketRef.current;

    // Connection events
    socket.on("connect", () => {
      setIsConnected(true);
      setCurrentPlayerId(socket.id);
      setError(null);
      console.log("✅ Connected to server:", socket.id);
    });

    socket.on("disconnect", (reason) => {
      setIsConnected(false);
      console.log("❌ Disconnected:", reason);
      if (reason === "io server disconnect") {
        socket.connect();
      }
    });

    socket.on("connect_error", (err) => {
      console.error("Connection error:", err);
      setError("Failed to connect to server");
    });

    // Room events
    socket.on("room-created", (data) => {
      console.log("🎮 Room created:", data.roomCode);
      setRoom(data.room);
      setGameState(null);
    });

    socket.on("room-joined", (data) => {
      console.log("🚪 Joined room:", data.room.roomCode);
      setRoom(data.room);
      setGameState(null);
    });

    socket.on("player-joined", (data) => {
      console.log("👤 Player joined:", data.player.name);
      setRoom(data.room);
    });

    socket.on("player-left", (data) => {
      console.log("👋 Player left:", data.playerId);
      setRoom(data.room);
      if (data.room.players.length === 0) {
        setRoom(null);
        setGameState(null);
      }
    });

    socket.on("player-ready-update", (data) => {
      console.log("✓ Player ready update");
      setRoom(data.room);
    });

    // Game events
    socket.on("game-started", (data) => {
      console.log("🎯 Game started!");
      setGameState(data.room);
      setRoom(null);
    });

    socket.on("game-updated", (data) => {
      console.log("🔄 Game updated:", data.action);
      setGameState(data.room);
    });

    socket.on("game-over", (data) => {
      console.log("🏆 Game over! Winner:", data.winner.name);
      setGameState(data.room);
      setTimeout(() => {
        alert(`🎉 ${data.winner.name} wins!`);
      }, 100);
    });

    // Chat events
    socket.on("chat-message", (data) => {
      setMessages((prev) => [...prev, data]);
    });

    socket.on("uno-called", (data) => {
      console.log("🎵 UNO called by:", data.playerName);
      // You can add a visual/audio notification here
    });

    // Error handling
    socket.on("error", (data) => {
      console.error("❌ Server error:", data.message);
      setError(data.message);
      setTimeout(() => setError(null), 3000);
    });

    // Cleanup
    return () => {
      socket.disconnect();
    };
  }, []);

  // Room actions
  const createRoom = useCallback((playerName) => {
    if (!socketRef.current) return;
    console.log("Creating room for:", playerName);
    socketRef.current.emit("create-room", { playerName });
  }, []);

  const joinRoom = useCallback((roomCode, playerName) => {
    if (!socketRef.current) return;
    console.log("Joining room:", roomCode);
    socketRef.current.emit("join-room", { roomCode, playerName });
  }, []);

  const leaveRoom = useCallback((roomCode) => {
    if (!socketRef.current) return;
    console.log("Leaving room:", roomCode);
    socketRef.current.emit("leave-room", { roomCode });
    setRoom(null);
    setGameState(null);
    setMessages([]);
  }, []);

  const setReady = useCallback((roomCode) => {
    if (!socketRef.current) return;
    console.log("Setting ready in room:", roomCode);
    socketRef.current.emit("player-ready", { roomCode });
  }, []);

  // Game actions
  const playCard = useCallback((roomCode, card, chosenColor = null) => {
    if (!socketRef.current) return;
    console.log("Playing card:", card.value, card.color);
    socketRef.current.emit("play-card", { roomCode, card, chosenColor });
  }, []);

  const drawCard = useCallback((roomCode) => {
    if (!socketRef.current) return;
    console.log("Drawing card");
    socketRef.current.emit("draw-card", { roomCode });
  }, []);

  const callUno = useCallback((roomCode) => {
    if (!socketRef.current) return;
    console.log("Calling UNO!");
    socketRef.current.emit("call-uno", { roomCode });
  }, []);

  const sendMessage = useCallback((roomCode, message) => {
    if (!socketRef.current) return;
    socketRef.current.emit("chat-message", { roomCode, message });
  }, []);

  // Helper to get current player
  const getCurrentPlayer = useCallback(() => {
    if (!gameState) return null;
    return gameState.players.find((p) => p.id === currentPlayerId);
  }, [gameState, currentPlayerId]);

  const isMyTurn = useCallback(() => {
    if (!gameState || !currentPlayerId) return false;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    return currentPlayer?.id === currentPlayerId;
  }, [gameState, currentPlayerId]);

  return {
    // Connection state
    isConnected,
    error,
    currentPlayerId,

    // Room state
    room,
    gameState,
    messages,

    // Room actions
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,

    // Game actions
    playCard,
    drawCard,
    callUno,
    sendMessage,

    // Helpers
    getCurrentPlayer,
    isMyTurn,
  };
}
