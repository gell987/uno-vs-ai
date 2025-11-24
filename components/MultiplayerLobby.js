// components/MultiplayerLobby.jsx
"use client";

import React, { useState, useEffect } from "react";
import { useMultiplayer } from "../hooks/useMultiplayer";
import ImprovedUnoGame from "./ImprovedUnoGame";

export default function MultiplayerLobby() {
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [mode, setMode] = useState("menu"); // menu, lobby, game
  const [chatMessage, setChatMessage] = useState("");
  const [showChat, setShowChat] = useState(false);

  const {
    isConnected,
    error,
    room,
    gameState,
    messages,
    currentPlayerId,
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    playCard,
    drawCard,
    callUno,
    sendMessage,
    getCurrentPlayer,
    isMyTurn,
  } = useMultiplayer();

  // Auto-switch to game mode when game starts
  useEffect(() => {
    if (gameState && gameState.gameState === "playing") {
      setMode("game");
    }
  }, [gameState]);

  // Handle room creation
  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      alert("Please enter your name");
      return;
    }
    createRoom(playerName.trim());
    setMode("lobby");
  };

  // Handle joining room
  const handleJoinRoom = () => {
    if (!playerName.trim() || !roomCode.trim()) {
      alert("Please enter your name and room code");
      return;
    }
    joinRoom(roomCode.toUpperCase().trim(), playerName.trim());
    setMode("lobby");
  };

  // Handle ready
  const handleReady = () => {
    if (room) {
      setReady(room.roomCode);
    }
  };

  // Handle leaving
  const handleLeave = () => {
    if (room) {
      leaveRoom(room.roomCode);
    }
    setMode("menu");
    setRoomCode("");
  };

  // Handle chat
  const handleSendMessage = () => {
    if (chatMessage.trim() && (room || gameState)) {
      const code = room?.roomCode || gameState?.roomCode;
      sendMessage(code, chatMessage.trim());
      setChatMessage("");
    }
  };

  // Connection screen
  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-white text-2xl font-bold">
            Connecting to server...
          </div>
          <div className="text-gray-400 text-sm mt-2">Please wait</div>
        </div>
      </div>
    );
  }

  // Main menu
  if (mode === "menu") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4">
        <div className="max-w-md w-full bg-black/80 border-4 border-cyan-400 rounded-xl p-6 sm:p-8 backdrop-blur-sm shadow-[0_0_50px_rgba(34,211,238,0.3)]">
          <h1 className="text-3xl sm:text-4xl font-black text-center mb-2 bg-gradient-to-r from-cyan-400 to-blue-400 text-transparent bg-clip-text">
            UNO MULTIPLAYER
          </h1>
          <div className="text-center text-gray-400 text-sm mb-8">
            Play with up to 4 friends online!
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-600/20 border-2 border-red-500 rounded-lg text-red-400 text-sm text-center">
              ⚠️ {error}
            </div>
          )}

          <input
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value.slice(0, 20))}
            onKeyPress={(e) => e.key === "Enter" && handleCreateRoom()}
            maxLength={20}
            className="w-full px-4 py-3 mb-6 bg-gray-800 border-2 border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-cyan-400 outline-none transition-all"
          />

          <button
            onClick={handleCreateRoom}
            disabled={!playerName.trim()}
            className="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 border-2 border-green-400 text-white font-bold rounded-lg hover:shadow-[0_0_20px_rgba(74,222,128,0.5)] transition-all mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🎮 CREATE ROOM
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-black/80 text-gray-500">OR</span>
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="ROOM CODE"
              value={roomCode}
              onChange={(e) =>
                setRoomCode(e.target.value.toUpperCase().slice(0, 6))
              }
              onKeyPress={(e) => e.key === "Enter" && handleJoinRoom()}
              maxLength={6}
              className="flex-1 px-4 py-3 bg-gray-800 border-2 border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-cyan-400 outline-none uppercase text-center font-mono text-lg transition-all"
            />
            <button
              onClick={handleJoinRoom}
              disabled={!playerName.trim() || !roomCode.trim()}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 border-2 border-blue-400 text-white font-bold rounded-lg hover:shadow-[0_0_20px_rgba(34,211,238,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              JOIN
            </button>
          </div>

          <div className="text-center text-gray-400 text-xs mt-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="mb-2">
              💡 <span className="font-bold">How to play:</span>
            </div>
            <div>1. Create a room or join with a code</div>
            <div>2. Share the code with friends</div>
            <div>3. Wait for players and click Ready!</div>
          </div>
        </div>
      </div>
    );
  }

  // Lobby (waiting room)
  if (mode === "lobby" && room) {
    const myPlayer = room.players.find((p) => p.id === currentPlayerId);
    const isHost = myPlayer?.isHost;
    const allReady = room.players.every((p) => p.isReady);
    const canStart = room.players.length >= 2 && allReady;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4">
        <div className="max-w-2xl w-full bg-black/80 border-4 border-cyan-400 rounded-xl p-6 sm:p-8 backdrop-blur-sm shadow-[0_0_50px_rgba(34,211,238,0.3)]">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-cyan-400 mb-2">
                ROOM: {room.roomCode}
              </h1>
              <div className="text-gray-400 text-sm">
                Share this code with friends!
              </div>
            </div>
            <button
              onClick={handleLeave}
              className="px-4 py-2 bg-red-600 border-2 border-red-400 text-white font-bold rounded-lg hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] transition-all"
            >
              ← LEAVE
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-600/20 border-2 border-red-500 rounded-lg text-red-400 text-sm text-center">
              ⚠️ {error}
            </div>
          )}

          {/* Players */}
          <div className="mb-6 p-4 sm:p-6 bg-gray-800/50 rounded-lg border-2 border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <div className="text-yellow-400 font-bold text-lg">
                👥 Players ({room.players.length}/{room.maxPlayers})
              </div>
              {room.players.length < 2 && (
                <div className="text-gray-400 text-sm">
                  Need {2 - room.players.length} more...
                </div>
              )}
            </div>

            <div className="space-y-3">
              {room.players.map((player, index) => (
                <div
                  key={player.id}
                  className={`flex justify-between items-center p-3 rounded-lg ${
                    player.id === currentPlayerId
                      ? "bg-blue-600/20 border-2 border-blue-500"
                      : "bg-gray-700/50 border-2 border-gray-600"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                        player.isReady ? "bg-green-600" : "bg-gray-600"
                      }`}
                    >
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold">
                          {player.name}
                        </span>
                        {player.id === currentPlayerId && (
                          <span className="text-xs bg-blue-600 px-2 py-0.5 rounded">
                            YOU
                          </span>
                        )}
                        {player.isHost && (
                          <span className="text-xs bg-yellow-600 px-2 py-0.5 rounded">
                            HOST
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-xs ${
                          player.isReady ? "text-green-400" : "text-gray-400"
                        }`}
                      >
                        {player.isReady ? "✓ Ready" : "Not ready"}
                      </div>
                    </div>
                  </div>

                  {player.isReady && <div className="text-2xl">✓</div>}
                </div>
              ))}
            </div>

            {/* Empty slots */}
            {Array.from({ length: room.maxPlayers - room.players.length }).map(
              (_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center gap-3 p-3 mt-3 bg-gray-800/30 border-2 border-dashed border-gray-600 rounded-lg"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                    <span className="text-gray-500">?</span>
                  </div>
                  <span className="text-gray-500 italic">
                    Waiting for player...
                  </span>
                </div>
              )
            )}
          </div>

          {/* Ready button */}
          <button
            onClick={handleReady}
            disabled={myPlayer?.isReady}
            className={`w-full px-6 py-4 font-bold rounded-lg transition-all text-lg ${
              myPlayer?.isReady
                ? "bg-green-600 border-2 border-green-400 text-white cursor-default"
                : "bg-gradient-to-r from-green-600 to-emerald-600 border-2 border-green-400 text-white hover:shadow-[0_0_20px_rgba(74,222,128,0.5)]"
            }`}
          >
            {myPlayer?.isReady ? "✓ YOU ARE READY" : "READY UP!"}
          </button>

          {canStart && (
            <div className="mt-4 p-3 bg-green-600/20 border-2 border-green-500 rounded-lg text-green-400 text-center animate-pulse">
              🎮 Starting game...
            </div>
          )}

          {!canStart && room.players.length >= 2 && (
            <div className="mt-4 text-center text-gray-400 text-sm">
              Waiting for all players to ready up...
            </div>
          )}
        </div>
      </div>
    );
  }

  // Game in progress
  if (mode === "game" && gameState) {
    const currentPlayer = getCurrentPlayer();
    const myTurn = isMyTurn();
    const topCard = gameState.discardPile[gameState.discardPile.length - 1];

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4">
        {/* Header */}
        <div className="max-w-6xl mx-auto mb-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 bg-black/80 border-2 border-cyan-400 rounded-lg">
            <div>
              <div className="text-cyan-400 font-bold text-xl">
                ROOM: {gameState.roomCode}
              </div>
              <div className="text-gray-400 text-sm">
                {myTurn
                  ? "🎯 Your Turn!"
                  : `⏳ ${
                      gameState.players[gameState.currentPlayerIndex]?.name
                    }'s turn`}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowChat(!showChat)}
                className="px-4 py-2 bg-blue-600 border-2 border-blue-400 text-white font-bold rounded-lg hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all relative"
              >
                💬 Chat
                {messages.length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {messages.length}
                  </span>
                )}
              </button>

              <button
                onClick={handleLeave}
                className="px-4 py-2 bg-red-600 border-2 border-red-400 text-white font-bold rounded-lg hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] transition-all"
              >
                ← Leave
              </button>
            </div>
          </div>
        </div>

        {/* Chat sidebar */}
        {showChat && (
          <div className="fixed right-4 top-20 bottom-4 w-80 bg-black/90 border-2 border-cyan-400 rounded-lg p-4 backdrop-blur-sm z-50 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-cyan-400 font-bold">Chat</h3>
              <button
                onClick={() => setShowChat(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto mb-4 space-y-2">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`p-2 rounded ${
                    msg.playerId === currentPlayerId
                      ? "bg-blue-600/20 ml-4"
                      : "bg-gray-800 mr-4"
                  }`}
                >
                  <div className="text-xs text-gray-400 mb-1">
                    {msg.playerName}
                  </div>
                  <div className="text-white text-sm">{msg.message}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 bg-gray-800 border-2 border-gray-600 rounded text-white text-sm focus:border-cyan-400 outline-none"
              />
              <button
                onClick={handleSendMessage}
                className="px-4 py-2 bg-cyan-600 text-white font-bold rounded hover:bg-cyan-700"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* Game UI - Integrate with your existing game */}
        <div className="max-w-6xl mx-auto">
          {/* You would integrate your ImprovedUnoGame component here */}
          {/* Pass the multiplayer functions as props */}
          <div className="text-white text-center">
            <div className="mb-4 p-4 bg-black/80 border-2 border-cyan-400 rounded-lg">
              <div className="text-2xl mb-2">
                Your Hand ({currentPlayer?.handSize} cards)
              </div>
              {/* Render cards here */}
              <div className="text-gray-400">
                Integration point for your UNO game component
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <button
                onClick={() => drawCard(gameState.roomCode)}
                disabled={!myTurn}
                className="px-6 py-4 bg-orange-600 border-2 border-orange-400 text-white font-bold rounded-lg disabled:opacity-50"
              >
                🃏 Draw Card
              </button>

              <button
                onClick={() => callUno(gameState.roomCode)}
                disabled={currentPlayer?.handSize !== 2}
                className="px-6 py-4 bg-yellow-600 border-2 border-yellow-400 text-black font-bold rounded-lg disabled:opacity-50"
              >
                🔔 Call UNO!
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div>Loading...</div>
    </div>
  );
}
