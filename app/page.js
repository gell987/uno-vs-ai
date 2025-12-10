"use client";

import React, { useState, useEffect } from "react";

// ============ CONSTANTS ============
const COLORS = ["red", "yellow", "green", "blue"];
const API_BASE = "";

// ============ BROWSER FINGERPRINT ============
async function generateFingerprint() {
  try {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width + "x" + screen.height,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 4,
      navigator.deviceMemory || 8,
    ];
    const text = components.join("|");
    const buffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text)
    );
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .substring(0, 32);
  } catch {
    return Math.random().toString(36).substring(2, 15);
  }
}

// ============ API CLIENT ============
class UnoAPI {
  constructor() {
    this.token = null;
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("uno_token");
    }
  }

  setToken(token) {
    this.token = token;
    if (typeof window !== "undefined") {
      localStorage.setItem("uno_token", token);
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("uno_token");
    }
  }

  async request(endpoint, options = {}) {
    const headers = { "Content-Type": "application/json" };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: { ...headers, ...options.headers },
      });
      return res.json();
    } catch (error) {
      return { success: false, error: "Network error", code: "NETWORK_ERROR" };
    }
  }

  async createUser(name, fingerprint) {
    const res = await this.request("/api/user/create", {
      method: "POST",
      body: JSON.stringify({ name, fingerprint: { browserId: fingerprint } }),
    });
    if (res.success) this.setToken(res.data.sessionToken);
    return res;
  }

  async login(email, password) {
    const res = await this.request("/api/user/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (res.success) this.setToken(res.data.sessionToken);
    return res;
  }

  async getProfile() {
    return this.request("/api/user/profile");
  }

  async createGame(difficulty, vsBot = true) {
    return this.request("/api/game/create", {
      method: "POST",
      body: JSON.stringify({ difficulty, vsBot }),
    });
  }

  async playCard(gameId, cardId, chosenColor = null) {
    return this.request("/api/game/play-card", {
      method: "POST",
      body: JSON.stringify({ gameId, cardId, chosenColor }),
    });
  }

  async drawCard(gameId) {
    return this.request("/api/game/draw", {
      method: "POST",
      body: JSON.stringify({ gameId }),
    });
  }

  async callUno(gameId) {
    return this.request("/api/game/uno", {
      method: "POST",
      body: JSON.stringify({ gameId }),
    });
  }

  async leaveGame(gameId) {
    return this.request("/api/game/state", {
      method: "POST",
      body: JSON.stringify({ gameId, action: "leave" }),
    });
  }

  async getLeaderboard(type = "wins", limit = 10) {
    return this.request(`/api/leaderboard?type=${type}&limit=${limit}`);
  }

  async getShopItems() {
    return this.request("/api/shop");
  }

  async buyItem(itemId) {
    return this.request("/api/shop/buy", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    });
  }
}

const api = new UnoAPI();

// ============ TERMINAL LINE COMPONENT ============
const TerminalLine = ({ prefix = ">", children, color = "text-green-400", delay = 0 }) => {
  const [show, setShow] = useState(delay === 0);

  useEffect(() => {
    if (delay > 0) {
      const timer = setTimeout(() => setShow(true), delay);
      return () => clearTimeout(timer);
    }
  }, [delay]);

  if (!show) return null;

  return (
    <div className={`font-mono ${color} mb-1`}>
      <span className="text-gray-500 mr-2">{prefix}</span>
      {children}
    </div>
  );
};

// ============ CARD COMPONENT (Terminal Style) ============
const Card = ({ card, onClick, disabled, highlight }) => {
  const colorMap = {
    red: "border-red-500 text-red-500",
    yellow: "border-yellow-500 text-yellow-400",
    green: "border-green-500 text-green-500",
    blue: "border-blue-500 text-blue-400",
    wild: "border-purple-500 text-purple-400",
  };

  const bgMap = {
    red: "bg-red-500/10",
    yellow: "bg-yellow-500/10",
    green: "bg-green-500/10",
    blue: "bg-blue-500/10",
    wild: "bg-purple-500/10",
  };

  const displayValue =
    card.value === "skip" ? "⊘" :
    card.value === "reverse" ? "↺" :
    card.value === "draw2" ? "+2" :
    card.value === "wild" ? "W" :
    card.value === "wild4" ? "+4" :
    card.value;

  return (
    <button
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
      className={`
        w-14 h-20 sm:w-16 sm:h-24 text-xl sm:text-2xl
        ${colorMap[card.color]} ${bgMap[card.color]}
        border-2 rounded font-mono font-bold
        transition-all duration-200
        ${disabled ? "opacity-40 cursor-not-allowed" : "hover:scale-110 hover:-translate-y-2 cursor-pointer"}
        ${highlight ? "ring-2 ring-white animate-pulse scale-105" : ""}
        flex items-center justify-center
      `}
    >
      {displayValue}
    </button>
  );
};

// ============ SCANLINES OVERLAY ============
const Scanlines = () => (
  <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden opacity-[0.03]">
    <div 
      className="absolute inset-0" 
      style={{
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 4px)",
      }} 
    />
  </div>
);

// ============ AUTH SCREEN ============
const AuthScreen = ({ onAuth }) => {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState([]);

  const addLog = (text, type = "info") => {
    setLogs(prev => [...prev, { text, type, id: Date.now() }]);
  };

  const handleSubmit = async () => {
    if (!name || name.length < 3) {
      setError("ERR: Username must be >= 3 characters");
      return;
    }

    setLoading(true);
    setError("");
    addLog(`Initializing connection...`);
    
    await new Promise(r => setTimeout(r, 300));
    addLog(`Generating device fingerprint...`);
    
    const fp = await generateFingerprint();
    addLog(`Fingerprint: ${fp.substring(0, 16)}...`);
    
    await new Promise(r => setTimeout(r, 200));
    addLog(`Authenticating user: ${name}`);
    
    const res = await api.createUser(name, fp);
    
    if (res.success) {
      addLog(`SUCCESS: Session established`, "success");
      await new Promise(r => setTimeout(r, 500));
      onAuth(res.data.user);
    } else {
      addLog(`FAILED: ${res.error}`, "error");
      setError(res.error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black p-4 sm:p-8 font-mono">
      <Scanlines />
      
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-green-500 mb-2">
            <span className="text-green-600">{">"}</span>
            <span className="text-green-600">{">"}</span>
            {" "}UNO_TERMINAL
            <span className="animate-pulse ml-1">_</span>
          </h1>
          <div className="text-green-700 text-sm">v2.0.0 // secure connection</div>
          <div className="h-px bg-gradient-to-r from-green-500 via-green-500/50 to-transparent mt-2" />
        </div>

        {/* Terminal Window */}
        <div className="border border-green-900 bg-black/80 rounded-lg overflow-hidden">
          {/* Title Bar */}
          <div className="bg-green-950/50 px-4 py-2 border-b border-green-900 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
            <span className="ml-4 text-green-600 text-sm">session_init.sh</span>
          </div>

          {/* Terminal Content */}
          <div className="p-4 sm:p-6 min-h-[300px]">
            <TerminalLine color="text-gray-500">System ready. Enter credentials to continue.</TerminalLine>
            <TerminalLine color="text-gray-600">─────────────────────────────────────────</TerminalLine>
            
            {/* Logs */}
            {logs.map((log) => (
              <TerminalLine 
                key={log.id} 
                prefix="$"
                color={log.type === "success" ? "text-green-400" : log.type === "error" ? "text-red-400" : "text-cyan-400"}
              >
                {log.text}
              </TerminalLine>
            ))}

            {/* Input */}
            {!loading && (
              <div className="mt-6">
                <label className="text-green-600 text-sm mb-2 block">ENTER_USERNAME:</label>
                <div className="flex gap-2 items-center">
                  <span className="text-green-500">$</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    placeholder="guest_user"
                    maxLength={20}
                    className="flex-1 bg-transparent border-b border-green-900 text-green-400 outline-none placeholder-green-900 font-mono py-1"
                    autoFocus
                  />
                </div>
                
                {error && (
                  <div className="text-red-500 mt-3 text-sm">{error}</div>
                )}

                <button
                  onClick={handleSubmit}
                  className="mt-6 px-6 py-2 border border-green-500 text-green-500 hover:bg-green-500 hover:text-black transition-all font-mono text-sm"
                >
                  [ CONNECT ]
                </button>
              </div>
            )}

            {loading && (
              <div className="mt-4 text-green-500">
                Processing<span className="animate-pulse">...</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 text-green-900 text-xs text-center">
          <span className="text-green-700">STATUS:</span> ONLINE | 
          <span className="text-green-700"> LATENCY:</span> {Math.floor(Math.random() * 50 + 10)}ms |
          <span className="text-green-700"> SECURE:</span> AES-256
        </div>
      </div>
    </div>
  );
};

// ============ MAIN MENU ============
const MainMenu = ({ user, onStartGame, onLogout, onShowLeaderboard, onShowShop }) => {
  const [difficulty, setDifficulty] = useState("medium");
  const [hoveredOption, setHoveredOption] = useState(null);

  const menuOptions = [
    { id: "play", label: "START_GAME", icon: "▶", action: () => onStartGame(difficulty) },
    { id: "leaderboard", label: "LEADERBOARD", icon: "◆", action: onShowLeaderboard },
    { id: "shop", label: "SHOP", icon: "◇", action: onShowShop },
    { id: "logout", label: "DISCONNECT", icon: "×", action: onLogout },
  ];

  return (
    <div className="min-h-screen bg-black p-4 sm:p-8 font-mono">
      <Scanlines />
      
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-green-500 mb-2">
            <span className="text-green-600">{">"}</span>
            <span className="text-green-600">{">"}</span>
            {" "}UNO_TERMINAL
          </h1>
          <p className="text-green-700 text-sm">
            Welcome, <span className="text-green-400">{user.name}</span>
          </p>
          <div className="h-px bg-gradient-to-r from-green-500 via-green-500/50 to-transparent mt-2" />
        </div>

        {/* Stats Panel */}
        <div className="border border-green-900 bg-black/80 rounded-lg p-4 mb-6">
          <div className="text-green-600 text-xs mb-3">[ USER_STATS ]</div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl text-yellow-500 font-bold">{user.coins || 0}</div>
              <div className="text-green-700 text-xs">COINS</div>
            </div>
            <div>
              <div className="text-2xl text-orange-500 font-bold">{user.streak || 0}</div>
              <div className="text-green-700 text-xs">STREAK</div>
            </div>
            <div>
              <div className="text-2xl text-cyan-500 font-bold">{user.winsTotal || 0}</div>
              <div className="text-green-700 text-xs">WINS</div>
            </div>
          </div>
        </div>

        {/* Difficulty Selector */}
        <div className="border border-green-900 bg-black/80 rounded-lg p-4 mb-6">
          <div className="text-green-600 text-xs mb-3">[ SELECT_DIFFICULTY ]</div>
          <div className="flex gap-2">
            {["easy", "medium", "hard"].map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`flex-1 py-2 border text-sm transition-all ${
                  difficulty === d
                    ? d === "easy"
                      ? "border-green-500 text-green-500 bg-green-500/10"
                      : d === "medium"
                      ? "border-yellow-500 text-yellow-500 bg-yellow-500/10"
                      : "border-red-500 text-red-500 bg-red-500/10"
                    : "border-green-900 text-green-700 hover:border-green-700"
                }`}
              >
                {d.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="text-center text-green-700 text-xs mt-2">
            Reward: +{difficulty === "easy" ? 10 : difficulty === "medium" ? 20 : 30} coins
          </div>
        </div>

        {/* Menu Options */}
        <div className="border border-green-900 bg-black/80 rounded-lg overflow-hidden">
          {menuOptions.map((option, idx) => (
            <button
              key={option.id}
              onClick={option.action}
              onMouseEnter={() => setHoveredOption(option.id)}
              onMouseLeave={() => setHoveredOption(null)}
              className={`w-full px-4 py-3 flex items-center gap-3 transition-all text-left ${
                idx !== menuOptions.length - 1 ? "border-b border-green-900" : ""
              } ${
                hoveredOption === option.id
                  ? "bg-green-500/10 text-green-400"
                  : "text-green-600 hover:bg-green-500/5"
              }`}
            >
              <span className={`transition-all ${hoveredOption === option.id ? "text-green-400" : "text-green-700"}`}>
                {option.icon}
              </span>
              <span>{option.label}</span>
              <span className="ml-auto text-green-800">
                {hoveredOption === option.id ? ">>>" : ">"}
              </span>
            </button>
          ))}
        </div>

        {/* Status Bar */}
        <div className="mt-4 text-green-900 text-xs flex justify-between">
          <span><span className="text-green-700">ID:</span> {user.id?.substring(0, 12)}...</span>
          <span><span className="text-green-700">TYPE:</span> {user.type?.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
};

// ============ GAME SCREEN ============
const GameScreen = ({ game, hand, playerIndex, onPlayCard, onDraw, onCallUno, onLeave, user }) => {
  const [choosingColor, setChoosingColor] = useState(false);
  const [pendingCard, setPendingCard] = useState(null);
  const [message, setMessage] = useState("");

  const isMyTurn = game.currentPlayerIndex === playerIndex;
  const myPlayer = game.players[playerIndex];
  const opponent = game.players[1 - playerIndex];

  const canPlayCard = (card) => {
    if (!isMyTurn) return false;
    if (game.drawPending > 0) {
      if (game.discardTop.value === "draw2") {
        return card.value === "draw2" || card.value === "wild4";
      }
      if (game.discardTop.value === "wild4") {
        return card.value === "wild4";
      }
    }
    if (card.color === "wild") return true;
    return card.color === game.currentColor || card.value === game.discardTop.value;
  };

  const handleCardClick = (card) => {
    if (!canPlayCard(card)) {
      setMessage("ERR: Invalid card selection");
      setTimeout(() => setMessage(""), 2000);
      return;
    }

    if (card.color === "wild") {
      setPendingCard(card);
      setChoosingColor(true);
    } else {
      onPlayCard(card.id, null);
    }
  };

  const handleColorChoice = (color) => {
    if (pendingCard) {
      onPlayCard(pendingCard.id, color);
      setPendingCard(null);
      setChoosingColor(false);
    }
  };

  return (
    <div className="min-h-screen bg-black p-3 sm:p-6 font-mono">
      <Scanlines />
      
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4 text-sm">
          <button
            onClick={onLeave}
            className="text-green-700 hover:text-green-500 transition-all"
          >
            [← EXIT]
          </button>
          <div className="text-green-600">
            <span className="text-green-700">MODE:</span> {game.difficulty.toUpperCase()}
          </div>
          <div className="text-yellow-500">
            <span className="text-green-700">COINS:</span> {user.coins || 0}
          </div>
        </div>

        {/* Opponent Area */}
        <div className="border border-green-900 bg-black/80 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-red-400">
              <span className="text-green-700">OPPONENT:</span> {opponent?.name}
            </span>
            <span className="text-green-600">
              CARDS: <span className="text-white">{opponent?.handSize}</span>
            </span>
            {opponent?.handSize === 1 && (
              <span className="text-yellow-500 animate-pulse font-bold">[!] UNO</span>
            )}
          </div>
          
          {/* Opponent cards (face down) */}
          <div className="flex justify-center gap-1 flex-wrap">
            {Array.from({ length: Math.min(opponent?.handSize || 0, 10) }).map((_, i) => (
              <div
                key={i}
                className="w-8 h-12 sm:w-10 sm:h-14 border border-green-900 bg-green-950/30 rounded flex items-center justify-center text-green-800 text-xs"
              >
                ?
              </div>
            ))}
            {(opponent?.handSize || 0) > 10 && (
              <span className="text-green-700 text-xs self-center ml-1">+{opponent.handSize - 10}</span>
            )}
          </div>
        </div>

        {/* Play Area */}
        <div className="border border-green-900 bg-green-950/20 rounded-lg p-4 sm:p-6 mb-4">
          <div className="flex justify-center items-center gap-6 sm:gap-12">
            {/* Draw Pile */}
            <button
              onClick={() => isMyTurn && onDraw()}
              disabled={!isMyTurn}
              className={`w-16 h-24 sm:w-20 sm:h-28 border-2 rounded flex flex-col items-center justify-center transition-all ${
                isMyTurn
                  ? "border-green-500 bg-green-950/50 hover:bg-green-900/50 cursor-pointer"
                  : "border-green-900 bg-black/50 opacity-50 cursor-not-allowed"
              }`}
            >
              <span className="text-2xl text-green-500">⬇</span>
              <span className="text-green-600 text-xs mt-1">DRAW</span>
              <span className="text-green-700 text-xs">[{game.deckSize}]</span>
            </button>

            {/* Discard Pile */}
            <div className="text-center">
              {game.discardTop && <Card card={game.discardTop} disabled />}
              {game.currentColor !== game.discardTop?.color && (
                <div className={`mt-2 text-xs font-bold ${
                  game.currentColor === "red" ? "text-red-500" :
                  game.currentColor === "yellow" ? "text-yellow-500" :
                  game.currentColor === "green" ? "text-green-500" :
                  "text-blue-500"
                }`}>
                  COLOR: {game.currentColor.toUpperCase()}
                </div>
              )}
            </div>

            {/* Turn Indicator */}
            <div className={`w-16 h-24 sm:w-20 sm:h-28 border-2 rounded flex flex-col items-center justify-center ${
              isMyTurn
                ? "border-cyan-500 bg-cyan-950/50 text-cyan-400"
                : "border-red-900 bg-red-950/30 text-red-500"
            }`}>
              <span className="text-2xl">{isMyTurn ? "◉" : "◎"}</span>
              <span className="text-xs mt-1">{isMyTurn ? "YOUR" : "WAIT"}</span>
              <span className="text-xs">TURN</span>
            </div>
          </div>

          {/* Status Message */}
          <div className="mt-4 text-center">
            <span className={`text-sm ${
              game.drawPending > 0 ? "text-red-500 font-bold" :
              isMyTurn ? "text-cyan-400" : "text-green-700"
            }`}>
              {game.drawPending > 0
                ? `[!] DRAW ${game.drawPending} OR STACK`
                : isMyTurn
                ? "> YOUR_TURN: Select a card"
                : "> WAITING: Opponent's turn..."}
            </span>
          </div>

          {/* Color Chooser */}
          {choosingColor && (
            <div className="mt-4 flex justify-center items-center gap-3">
              <span className="text-green-600 text-sm">SELECT_COLOR:</span>
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorChoice(color)}
                  className={`w-10 h-10 sm:w-12 sm:h-12 border-2 rounded transition-all hover:scale-110 flex items-center justify-center text-lg ${
                    color === "red" ? "border-red-500 bg-red-500/20 text-red-500" :
                    color === "yellow" ? "border-yellow-500 bg-yellow-500/20 text-yellow-500" :
                    color === "green" ? "border-green-500 bg-green-500/20 text-green-500" :
                    "border-blue-500 bg-blue-500/20 text-blue-500"
                  }`}
                >
                  ■
                </button>
              ))}
            </div>
          )}

          {message && (
            <div className="mt-2 text-center text-red-500 text-sm">{message}</div>
          )}
        </div>

        {/* Player Hand */}
        <div className="border border-green-900 bg-black/80 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <span className="text-cyan-400">
              <span className="text-green-700">PLAYER:</span> {myPlayer?.name || user.name}
            </span>
            <span className="text-green-600">
              CARDS: <span className="text-white">{hand.length}</span>
            </span>
            {hand.length === 2 && (
              <button
                onClick={onCallUno}
                className="px-3 py-1 border border-yellow-500 text-yellow-500 text-xs hover:bg-yellow-500 hover:text-black transition-all animate-pulse font-bold"
              >
                [!] CALL UNO
              </button>
            )}
            {myPlayer?.calledUno && hand.length <= 2 && (
              <span className="text-yellow-500 text-sm">[UNO CALLED]</span>
            )}
          </div>

          {/* Player Cards */}
          <div className="flex justify-center gap-1 sm:gap-2 flex-wrap min-h-[100px] items-end">
            {hand.map((card) => (
              <Card
                key={card.id}
                card={card}
                onClick={() => handleCardClick(card)}
                disabled={!isMyTurn || (choosingColor && pendingCard?.id !== card.id)}
                highlight={isMyTurn && canPlayCard(card)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ GAME OVER MODAL ============
const GameOverModal = ({ winner, rewards, onPlayAgain, onMainMenu }) => {
  const isWin = winner === "player";

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-40 font-mono p-4">
      <Scanlines />
      
      <div className={`border-2 ${isWin ? "border-green-500" : "border-red-500"} bg-black p-6 sm:p-8 rounded-lg max-w-md w-full text-center`}>
        <div className={`text-4xl sm:text-5xl font-bold mb-4 ${isWin ? "text-green-500" : "text-red-500"}`}>
          {isWin ? "VICTORY" : "DEFEAT"}
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-green-500/50 to-transparent mb-6" />

        {rewards && (
          <div className="space-y-2 mb-6">
            {rewards.coinsAwarded > 0 && (
              <div className="text-yellow-500">
                <span className="text-green-700">COINS:</span> +{rewards.coinsAwarded}
              </div>
            )}
            {rewards.streakUpdated && (
              <div className="text-orange-500">
                <span className="text-green-700">STREAK:</span> {rewards.newStreak}
              </div>
            )}
            {rewards.warning && (
              <div className="text-red-500 text-sm">{rewards.warning}</div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onPlayAgain}
            className="flex-1 py-3 border border-green-500 text-green-500 hover:bg-green-500 hover:text-black transition-all"
          >
            [▶] PLAY AGAIN
          </button>
          <button
            onClick={onMainMenu}
            className="flex-1 py-3 border border-green-700 text-green-700 hover:border-green-500 hover:text-green-500 transition-all"
          >
            [←] MENU
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ LEADERBOARD MODAL ============
const LeaderboardModal = ({ onClose }) => {
  const [type, setType] = useState("wins");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, [type]);

  const loadLeaderboard = async () => {
    setLoading(true);
    const res = await api.getLeaderboard(type, 15);
    if (res.success) setEntries(res.data.entries);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-40 font-mono p-4">
      <Scanlines />
      
      <div className="border border-green-900 bg-black p-6 rounded-lg max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-green-500 text-xl font-bold">[ LEADERBOARD ]</h2>
          <button onClick={onClose} className="text-green-700 hover:text-green-500 text-xl">[×]</button>
        </div>

        <div className="flex gap-2 mb-4">
          {["wins", "streaks", "coins"].map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 py-2 text-xs border transition-all ${
                type === t
                  ? "border-green-500 text-green-500 bg-green-500/10"
                  : "border-green-900 text-green-700 hover:border-green-700"
              }`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-green-500 text-center py-8">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="text-green-700 text-center py-8">No entries yet</div>
          ) : (
            <div className="space-y-1">
              {entries.map((entry, idx) => (
                <div
                  key={entry.oderId || idx}
                  className={`flex items-center gap-3 px-3 py-2 ${
                    idx < 3 ? "bg-green-950/30" : "bg-black/50"
                  } border-l-2 ${
                    idx === 0 ? "border-yellow-500" :
                    idx === 1 ? "border-gray-400" :
                    idx === 2 ? "border-orange-600" :
                    "border-green-900"
                  }`}
                >
                  <span className={`w-8 text-right ${
                    idx < 3 ? "text-yellow-500" : "text-green-700"
                  }`}>
                    #{entry.rank}
                  </span>
                  <span className="flex-1 text-green-400 truncate">{entry.name}</span>
                  <span className="text-cyan-500">{entry.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ SHOP MODAL ============
const ShopModal = ({ user, onClose, onPurchase }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadShop();
  }, []);

  const loadShop = async () => {
    const res = await api.getShopItems();
    if (res.success) setItems(res.data.items);
    setLoading(false);
  };

  const handleBuy = async (itemId) => {
    setPurchasing(itemId);
    setMessage("");
    const res = await api.buyItem(itemId);
    if (res.success) {
      setMessage(`SUCCESS: Purchased! Balance: ${res.data.newBalance}`);
      onPurchase(res.data);
    } else {
      setMessage(`ERR: ${res.error}`);
    }
    setPurchasing(null);
  };

  const ownedItems = typeof user?.cosmetics === 'string' ? user.cosmetics.split(',') : [];

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-40 font-mono p-4">
      <Scanlines />
      
      <div className="border border-green-900 bg-black p-6 rounded-lg max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-green-500 text-xl font-bold">[ SHOP ]</h2>
          <div className="flex items-center gap-4">
            <span className="text-yellow-500">
              <span className="text-green-700">BALANCE:</span> {user?.coins || 0}
            </span>
            <button onClick={onClose} className="text-green-700 hover:text-green-500 text-xl">[×]</button>
          </div>
        </div>

        {message && (
          <div className={`text-sm mb-4 py-2 px-3 rounded ${message.includes("SUCCESS") ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10"}`}>
            {message}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-green-500 text-center py-8">Loading...</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map((item) => {
                const owned = ownedItems.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={`border p-3 rounded ${
                      owned ? "border-green-900 opacity-60" : "border-green-800"
                    }`}
                  >
                    <div className="text-green-400 text-sm font-bold mb-1">{item.name}</div>
                    <div className="text-green-700 text-xs mb-2 min-h-[32px]">{item.desc}</div>
                    {owned ? (
                      <div className="text-green-600 text-xs">[OWNED]</div>
                    ) : (
                      <button
                        onClick={() => handleBuy(item.id)}
                        disabled={purchasing === item.id || (user?.coins || 0) < item.price}
                        className="px-3 py-1 text-xs border border-yellow-600 text-yellow-600 hover:bg-yellow-600 hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {purchasing === item.id ? "..." : `${item.price} COINS`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ MAIN APP ============
export default function UnoGame() {
  const [screen, setScreen] = useState("loading");
  const [user, setUser] = useState(null);
  const [game, setGame] = useState(null);
  const [hand, setHand] = useState([]);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [rewards, setRewards] = useState(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    if (api.token) {
      const res = await api.getProfile();
      if (res.success) {
        setUser({
          ...res.data.profile,
          coins: res.data.profile.stats.coins,
          streak: res.data.profile.stats.streak,
          winsTotal: res.data.profile.stats.winsTotal,
        });
        setScreen("menu");
      } else {
        api.clearToken();
        setScreen("auth");
      }
    } else {
      setScreen("auth");
    }
  };

  const handleAuth = (userData) => {
    setUser(userData);
    setScreen("menu");
  };

  const handleLogout = () => {
    api.clearToken();
    setUser(null);
    setScreen("auth");
  };

  const handleStartGame = async (difficulty) => {
    setLoading(true);
    const res = await api.createGame(difficulty, true);
    if (res.success) {
      setGame(res.data.game);
      setHand(res.data.hand);
      setPlayerIndex(0);
      setGameOver(false);
      setRewards(null);
      setScreen("game");
    }
    setLoading(false);
  };

  const handlePlayCard = async (cardId, chosenColor) => {
    if (!game) return;
    const res = await api.playCard(game.id, cardId, chosenColor);
    if (res.success) {
      setGame(res.data.game);
      setHand(res.data.hand);
      if (res.data.gameEnded) {
        setGameOver(true);
        setRewards(res.data.rewards);
        if (res.data.rewards?.coinsAwarded) {
          setUser((prev) => ({
            ...prev,
            coins: (prev.coins || 0) + res.data.rewards.coinsAwarded,
            streak: res.data.rewards.newStreak || prev.streak,
          }));
        }
      }
    }
  };

  const handleDraw = async () => {
    if (!game) return;
    const res = await api.drawCard(game.id);
    if (res.success) {
      setGame(res.data.game);
      setHand(res.data.hand);
      if (res.data.gameEnded) setGameOver(true);
    }
  };

  const handleCallUno = async () => {
    if (!game) return;
    await api.callUno(game.id);
  };

  const handleLeaveGame = async () => {
    if (game) await api.leaveGame(game.id);
    setGame(null);
    setHand([]);
    setGameOver(false);
    setScreen("menu");
  };

  const handlePlayAgain = () => {
    setGameOver(false);
    setRewards(null);
    handleStartGame(game?.difficulty || "medium");
  };

  const handleShopPurchase = (data) => {
    setUser((prev) => ({
      ...prev,
      coins: data.newBalance,
      cosmetics: data.ownedCosmetics,
    }));
  };

  // Loading screen
  if (screen === "loading") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-mono">
        <Scanlines />
        <div className="text-green-500">
          <span className="text-green-600">{">>"}</span> INITIALIZING
          <span className="animate-pulse">...</span>
        </div>
      </div>
    );
  }

  // Auth screen
  if (screen === "auth") {
    return <AuthScreen onAuth={handleAuth} />;
  }

  // Main menu
  if (screen === "menu") {
    return (
      <>
        <MainMenu
          user={user}
          onStartGame={handleStartGame}
          onLogout={handleLogout}
          onShowLeaderboard={() => setShowLeaderboard(true)}
          onShowShop={() => setShowShop(true)}
        />
        {showLeaderboard && <LeaderboardModal onClose={() => setShowLeaderboard(false)} />}
        {showShop && (
          <ShopModal
            user={user}
            onClose={() => setShowShop(false)}
            onPurchase={handleShopPurchase}
          />
        )}
        {loading && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 font-mono">
            <Scanlines />
            <div className="text-green-500">
              <span className="text-green-600">{">>"}</span> CREATING_GAME
              <span className="animate-pulse">...</span>
            </div>
          </div>
        )}
      </>
    );
  }

  // Game screen
  if (screen === "game" && game) {
    return (
      <>
        <GameScreen
          game={game}
          hand={hand}
          playerIndex={playerIndex}
          onPlayCard={handlePlayCard}
          onDraw={handleDraw}
          onCallUno={handleCallUno}
          onLeave={handleLeaveGame}
          user={user}
        />
        {gameOver && (
          <GameOverModal
            winner={game.winner === playerIndex ? "player" : "opponent"}
            rewards={rewards}
            onPlayAgain={handlePlayAgain}
            onMainMenu={handleLeaveGame}
          />
        )}
      </>
    );
  }

  return null;
}
