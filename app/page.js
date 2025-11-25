"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

// ============ CONSTANTS ============
const COLORS = ["red", "yellow", "green", "blue"];
const API_BASE = ""; // Same origin, or set to your API URL

const colorStyles = {
  red: "bg-gradient-to-br from-red-600 via-red-500 to-red-700",
  yellow: "bg-gradient-to-br from-yellow-400 via-yellow-300 to-yellow-500",
  green: "bg-gradient-to-br from-green-600 via-green-500 to-green-700",
  blue: "bg-gradient-to-br from-blue-600 via-blue-500 to-blue-700",
  wild: "bg-gradient-to-br from-gray-900 via-gray-800 to-black",
};

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

  // User endpoints
  async createUser(name, fingerprint) {
    const res = await this.request("/api/user/create", {
      method: "POST",
      body: JSON.stringify({ name, fingerprint: { browserId: fingerprint } }),
    });
    if (res.success) {
      this.setToken(res.data.sessionToken);
    }
    return res;
  }

  async login(email, password) {
    const res = await this.request("/api/user/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (res.success) {
      this.setToken(res.data.sessionToken);
    }
    return res;
  }

  async getProfile() {
    return this.request("/api/user/profile");
  }

  async updateProfile(data) {
    return this.request("/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // Game endpoints
  async createGame(difficulty, vsBot = true) {
    return this.request("/api/game/create", {
      method: "POST",
      body: JSON.stringify({ difficulty, vsBot }),
    });
  }

  async joinGame(gameId) {
    return this.request("/api/game/join", {
      method: "POST",
      body: JSON.stringify({ gameId }),
    });
  }

  async getGameState(gameId = null) {
    const url = gameId
      ? `/api/game/state?gameId=${gameId}`
      : "/api/game/state";
    return this.request(url);
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

  async finishGame(gameId) {
    return this.request("/api/game/finish", {
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

  // Leaderboard
  async getLeaderboard(type = "wins", limit = 10, offset = 0) {
    return this.request(
      `/api/leaderboard?type=${type}&limit=${limit}&offset=${offset}`
    );
  }

  async getMyRanks() {
    return this.request("/api/leaderboard", { method: "POST" });
  }

  // Shop
  async getShopItems(type = null) {
    const url = type ? `/api/shop?type=${type}` : "/api/shop";
    return this.request(url);
  }

  async buyItem(itemId) {
    return this.request("/api/shop/buy", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    });
  }
}

const api = new UnoAPI();

// ============ SOUND EFFECTS ============
const useSoundEffects = () => {
  const audioContextRef = useRef(null);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext ||
      window.webkitAudioContext)();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const playSound = useCallback((type) => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;

    const playTone = (freq, duration, waveType = "sine", volume = 0.2) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = waveType;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    };

    switch (type) {
      case "cardPlay":
        playTone(500, 0.08, "sine", 0.2);
        break;
      case "cardDraw":
        playTone(350, 0.05, "triangle", 0.2);
        break;
      case "uno":
        [440, 554.37, 659.25].forEach((freq, i) => {
          setTimeout(() => playTone(freq, 0.3, "sine", 0.15), i * 100);
        });
        break;
      case "win":
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          setTimeout(() => playTone(freq, 0.25, "sine", 0.2), i * 120);
        });
        break;
      case "lose":
        [196, 233.08, 261.63].forEach((freq, i) => {
          setTimeout(() => playTone(freq, 0.3, "triangle", 0.15), i * 150);
        });
        break;
      case "special":
        [400, 500, 600, 700, 800].forEach((freq, i) => {
          setTimeout(() => playTone(freq, 0.15, "sine", 0.12), i * 50);
        });
        break;
      case "invalid":
        playTone(180, 0.15, "square", 0.25);
        break;
      case "coins":
        [800, 1000, 1200].forEach((freq, i) => {
          setTimeout(() => playTone(freq, 0.1, "sine", 0.1), i * 80);
        });
        break;
      default:
        break;
    }
  }, []);

  return playSound;
};

// ============ CARD COMPONENT ============
const Card = ({ card, onClick, disabled, small, highlight, index }) => {
  const displayValue =
    card.value === "skip"
      ? "⊘"
      : card.value === "reverse"
      ? "⇄"
      : card.value === "draw2"
      ? "+2"
      : card.value === "wild"
      ? "W"
      : card.value === "wild4"
      ? "+4"
      : card.value;

  const isWild = card.color === "wild";
  const borderColor = isWild ? "border-gray-300" : "border-white";

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={`${
        small ? "w-12 h-16 sm:w-14 sm:h-20" : "w-16 h-24 sm:w-20 sm:h-32"
      } ${colorStyles[card.color]} rounded-lg sm:rounded-xl flex items-center justify-center font-bold shadow-2xl border-4 sm:border-[6px] transition-all duration-300 relative overflow-hidden ${borderColor} ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "cursor-pointer hover:scale-110 hover:-translate-y-2 sm:hover:-translate-y-4"
      } ${
        highlight
          ? "ring-2 sm:ring-4 ring-yellow-400 scale-105 shadow-[0_0_30px_rgba(255,215,0,0.6)]"
          : ""
      }`}
      style={{
        transform: `translateY(${(index || 0) * -2}px) ${
          highlight ? "scale(1.05)" : ""
        }`,
        zIndex: highlight ? 100 : index || 0,
        boxShadow: `0 10px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3)`,
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent rounded-lg pointer-events-none" />
      <span
        className={`${
          small ? "text-xl sm:text-2xl" : "text-3xl sm:text-5xl"
        } font-black text-white drop-shadow-[3px_3px_6px_rgba(0,0,0,0.8)]`}
      >
        {displayValue}
      </span>
      {!small && (
        <>
          <div className="absolute top-1 left-1 sm:top-2 sm:left-2 text-[10px] sm:text-xs font-bold text-white opacity-80">
            {displayValue}
          </div>
          <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 text-[10px] sm:text-xs font-bold text-white opacity-80 rotate-180">
            {displayValue}
          </div>
        </>
      )}
    </div>
  );
};

// ============ CARD BACK COMPONENT ============
const CardBack = ({ count, difficulty }) => {
  const difficultyColors = {
    easy: "from-green-900 to-green-800 border-green-700",
    medium: "from-yellow-900 to-yellow-800 border-yellow-700",
    hard: "from-red-900 to-red-800 border-red-700",
  };

  return (
    <div className="flex justify-center gap-0.5 sm:gap-1 flex-wrap max-w-full px-2">
      {Array.from({ length: Math.min(count, 15) }).map((_, idx) => (
        <div
          key={idx}
          className={`w-12 h-16 sm:w-14 sm:h-20 bg-gradient-to-br ${
            difficultyColors[difficulty] || difficultyColors.easy
          } border border-gray-700 sm:border-2 rounded-lg shadow-xl overflow-hidden`}
          style={{
            transform: `rotate(${(idx - count / 2) * 1.5}deg)`,
            zIndex: count - idx,
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white text-xl sm:text-2xl font-black opacity-80">
              UNO
            </div>
          </div>
        </div>
      ))}
      {count > 15 && (
        <div className="text-white text-sm ml-2">+{count - 15}</div>
      )}
    </div>
  );
};

// ============ AUTH MODAL ============
const AuthModal = ({ onAuth, onClose }) => {
  const [mode, setMode] = useState("guest"); // guest, login, register
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      if (mode === "guest") {
        if (!name || name.length < 3) {
          setError("Name must be at least 3 characters");
          setLoading(false);
          return;
        }
        const fp = await generateFingerprint();
        const res = await api.createUser(name, fp);
        if (res.success) {
          onAuth(res.data.user);
        } else {
          setError(res.error || "Failed to create user");
        }
      } else if (mode === "login") {
        const res = await api.login(email, password);
        if (res.success) {
          onAuth(res.data.user);
        } else {
          setError(res.error || "Invalid credentials");
        }
      } else if (mode === "register") {
        if (!name || name.length < 3) {
          setError("Name must be at least 3 characters");
          setLoading(false);
          return;
        }
        const fp = await generateFingerprint();
        const res = await api.createUser(name, fp);
        if (res.success) {
          onAuth(res.data.user);
        } else {
          setError(res.error || "Failed to register");
        }
      }
    } catch (err) {
      setError("Network error");
    }

    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="border-4 border-cyan-400 bg-gradient-to-br from-gray-900 to-black p-6 sm:p-8 rounded-2xl max-w-md w-full shadow-[0_0_50px_rgba(0,255,255,0.3)]">
        <h2 className="text-2xl sm:text-3xl font-black text-cyan-400 text-center mb-6">
          UNO <span className="text-pink-400">ELITE</span>
        </h2>

        <div className="flex gap-2 mb-6">
          {["guest", "login", "register"].map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError("");
              }}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                mode === m
                  ? "bg-cyan-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {m === "guest" ? "Guest" : m === "login" ? "Login" : "Register"}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {(mode === "guest" || mode === "register") && (
            <input
              type="text"
              placeholder="Username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border-2 border-gray-700 rounded-lg text-white focus:border-cyan-400 outline-none"
              maxLength={20}
            />
          )}

          {(mode === "login" || mode === "register") && (
            <>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border-2 border-gray-700 rounded-lg text-white focus:border-cyan-400 outline-none"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border-2 border-gray-700 rounded-lg text-white focus:border-cyan-400 outline-none"
              />
            </>
          )}

          {error && (
            <div className="text-red-400 text-sm text-center">{error}</div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold rounded-lg hover:from-cyan-500 hover:to-blue-500 transition-all disabled:opacity-50"
          >
            {loading
              ? "Loading..."
              : mode === "guest"
              ? "Play as Guest"
              : mode === "login"
              ? "Login"
              : "Register"}
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
  const [myRanks, setMyRanks] = useState(null);

  useEffect(() => {
    loadLeaderboard();
    loadMyRanks();
  }, [type]);

  const loadLeaderboard = async () => {
    setLoading(true);
    const res = await api.getLeaderboard(type, 20);
    if (res.success) {
      setEntries(res.data.entries);
    }
    setLoading(false);
  };

  const loadMyRanks = async () => {
    const res = await api.getMyRanks();
    if (res.success) {
      setMyRanks(res.data);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="border-4 border-yellow-400 bg-gradient-to-br from-gray-900 to-black p-6 rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-black text-yellow-400">🏆 Leaderboard</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          {["wins", "streaks", "coins"].map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                type === t
                  ? "bg-yellow-600 text-black"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {t === "wins" ? "🏅 Wins" : t === "streaks" ? "🔥 Streaks" : "💰 Coins"}
            </button>
          ))}
        </div>

        {myRanks && (
          <div className="bg-gray-800/50 rounded-lg p-3 mb-4 border border-cyan-400/30">
            <div className="text-cyan-400 text-sm font-bold mb-1">Your Rank</div>
            <div className="text-white">
              #{myRanks[type]?.rank || "—"} ({myRanks[type]?.value || 0}{" "}
              {type === "coins" ? "💰" : type === "streaks" ? "🔥" : "🏅"})
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center text-gray-400 py-8">Loading...</div>
          ) : (
            <div className="space-y-2">
              {entries.map((entry, idx) => (
                <div
                  key={entry.oderId}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    idx < 3 ? "bg-yellow-900/30" : "bg-gray-800/30"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                      idx === 0
                        ? "bg-yellow-500 text-black"
                        : idx === 1
                        ? "bg-gray-400 text-black"
                        : idx === 2
                        ? "bg-orange-600 text-white"
                        : "bg-gray-700 text-gray-300"
                    }`}
                  >
                    {entry.rank}
                  </div>
                  <div className="flex-1 text-white font-medium truncate">
                    {entry.name}
                  </div>
                  <div className="text-yellow-400 font-bold">{entry.value}</div>
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
  const [grouped, setGrouped] = useState({});
  const [category, setCategory] = useState("cardBack");
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadShop();
  }, []);

  const loadShop = async () => {
    const res = await api.getShopItems();
    if (res.success) {
      setItems(res.data.items);
      setGrouped(res.data.grouped);
    }
    setLoading(false);
  };

  const handleBuy = async (itemId) => {
    setPurchasing(itemId);
    setMessage("");
    const res = await api.buyItem(itemId);
    if (res.success) {
      setMessage(`Purchased! New balance: ${res.data.newBalance} coins`);
      onPurchase(res.data);
    } else {
      setMessage(res.error || "Purchase failed");
    }
    setPurchasing(null);
  };

  const ownedItems = user?.cosmetics?.owned || [];

  const categories = [
    { id: "cardBack", label: "🎴 Cards", icon: "🎴" },
    { id: "badge", label: "🏅 Badges", icon: "🏅" },
    { id: "emoji", label: "😄 Emojis", icon: "😄" },
    { id: "theme", label: "🎨 Themes", icon: "🎨" },
    { id: "animation", label: "✨ Effects", icon: "✨" },
  ];

  const rarityColors = {
    common: "border-gray-500 bg-gray-800/50",
    rare: "border-blue-500 bg-blue-900/30",
    epic: "border-purple-500 bg-purple-900/30",
    legendary: "border-yellow-500 bg-yellow-900/30",
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="border-4 border-pink-400 bg-gradient-to-br from-gray-900 to-black p-6 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-black text-pink-400">🛒 Shop</h2>
          <div className="flex items-center gap-4">
            <div className="text-yellow-400 font-bold">
              💰 {user?.stats?.coins || 0}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex gap-1 sm:gap-2 mb-4 overflow-x-auto pb-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-3 py-2 text-xs sm:text-sm font-bold rounded-lg whitespace-nowrap transition-all ${
                category === cat.id
                  ? "bg-pink-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {message && (
          <div
            className={`text-center py-2 mb-4 rounded-lg ${
              message.includes("Purchased")
                ? "bg-green-900/50 text-green-400"
                : "bg-red-900/50 text-red-400"
            }`}
          >
            {message}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center text-gray-400 py-8">Loading...</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(grouped[category] || []).map((item) => {
                const owned = ownedItems.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border-2 ${rarityColors[item.rarity]} ${
                      owned ? "opacity-60" : ""
                    }`}
                  >
                    <div className="text-center mb-2">
                      <div className="text-2xl mb-1">
                        {item.type === "cardBack"
                          ? "🎴"
                          : item.type === "badge"
                          ? "🏅"
                          : item.type === "emoji"
                          ? "😄"
                          : item.type === "theme"
                          ? "🎨"
                          : "✨"}
                      </div>
                      <div className="text-white font-bold text-sm">
                        {item.name}
                      </div>
                      <div className="text-gray-400 text-xs">{item.desc}</div>
                    </div>
                    <div className="text-center">
                      {owned ? (
                        <div className="text-green-400 text-sm font-bold">
                          ✓ Owned
                        </div>
                      ) : (
                        <button
                          onClick={() => handleBuy(item.id)}
                          disabled={
                            purchasing === item.id ||
                            (user?.stats?.coins || 0) < item.price
                          }
                          className="px-4 py-1 bg-gradient-to-r from-yellow-600 to-orange-600 text-white text-sm font-bold rounded-lg hover:from-yellow-500 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {purchasing === item.id
                            ? "..."
                            : `💰 ${item.price}`}
                        </button>
                      )}
                    </div>
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

// ============ PROFILE MODAL ============
const ProfileModal = ({ user, onClose, onUpdate }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const res = await api.getProfile();
    if (res.success) {
      setStats(res.data.profile);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="border-4 border-cyan-400 bg-gradient-to-br from-gray-900 to-black p-6 rounded-2xl max-w-md w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-black text-cyan-400">👤 Profile</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="text-center mb-6">
          <div className="text-3xl mb-2">🎮</div>
          <div className="text-white text-xl font-bold">{stats?.name}</div>
          <div className="text-gray-400 text-sm">
            {stats?.type === "registered" ? "Registered" : "Guest"}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-gray-800/50 rounded-lg p-3 text-center">
            <div className="text-2xl">🎮</div>
            <div className="text-white font-bold">
              {stats?.stats?.gamesPlayed}
            </div>
            <div className="text-gray-400 text-xs">Games</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 text-center">
            <div className="text-2xl">🏆</div>
            <div className="text-white font-bold">{stats?.stats?.winsTotal}</div>
            <div className="text-gray-400 text-xs">Wins</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 text-center">
            <div className="text-2xl">🔥</div>
            <div className="text-white font-bold">{stats?.stats?.streak}</div>
            <div className="text-gray-400 text-xs">
              Streak (Max: {stats?.stats?.maxStreak})
            </div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 text-center">
            <div className="text-2xl">💰</div>
            <div className="text-white font-bold">{stats?.stats?.coins}</div>
            <div className="text-gray-400 text-xs">Coins</div>
          </div>
        </div>

        <div className="bg-gray-800/30 rounded-lg p-4 mb-4">
          <div className="text-gray-400 text-sm mb-2">Win Rate</div>
          <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-emerald-400"
              style={{ width: `${stats?.stats?.winRate || 0}%` }}
            />
          </div>
          <div className="text-white text-right text-sm mt-1">
            {stats?.stats?.winRate}%
          </div>
        </div>

        {stats?.ranks && (
          <div className="bg-yellow-900/20 rounded-lg p-4 border border-yellow-600/30">
            <div className="text-yellow-400 text-sm font-bold mb-2">
              🏆 Rankings
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <div className="text-gray-400">Wins</div>
                <div className="text-white font-bold">
                  #{stats.ranks.wins || "—"}
                </div>
              </div>
              <div>
                <div className="text-gray-400">Streak</div>
                <div className="text-white font-bold">
                  #{stats.ranks.streak || "—"}
                </div>
              </div>
              <div>
                <div className="text-gray-400">Coins</div>
                <div className="text-white font-bold">
                  #{stats.ranks.coins || "—"}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ GAME OVER MODAL ============
const GameOverModal = ({ winner, rewards, onPlayAgain, onMainMenu }) => {
  const isWin = winner === "player";

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 backdrop-blur-md p-4">
      <div className="border-4 border-yellow-400 bg-gradient-to-br from-gray-900 to-black p-6 sm:p-10 text-center max-w-md w-full rounded-2xl shadow-[0_0_50px_rgba(250,204,21,0.5)]">
        <div className="text-4xl sm:text-5xl font-black mb-4 sm:mb-6">
          {isWin ? (
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 animate-pulse">
              🎉 YOU WIN! 🎉
            </span>
          ) : (
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-pink-500">
              😢 YOU LOSE
            </span>
          )}
        </div>

        {rewards && (
          <div className="bg-gray-800/50 rounded-lg p-4 mb-6 space-y-2">
            {rewards.coinsAwarded > 0 && (
              <div className="text-yellow-400 font-bold text-lg">
                💰 +{rewards.coinsAwarded} Coins
              </div>
            )}
            {rewards.streakUpdated && (
              <div className="text-orange-400 font-bold">
                🔥 Streak: {rewards.newStreak}
              </div>
            )}
            {rewards.warning && (
              <div className="text-red-400 text-sm">{rewards.warning}</div>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onPlayAgain}
            className="flex-1 px-6 py-3 border-2 bg-gradient-to-r from-green-600 to-emerald-600 border-green-400 text-white font-bold rounded-lg hover:shadow-[0_0_20px_rgba(74,222,128,0.5)] transition-all"
          >
            🎮 Play Again
          </button>
          <button
            onClick={onMainMenu}
            className="flex-1 px-6 py-3 border-2 bg-gray-800 border-gray-600 text-gray-300 font-bold rounded-lg hover:border-gray-400 transition-all"
          >
            🏠 Menu
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ MAIN MENU ============
const MainMenu = ({ user, onStartGame, onLogout, onShowLeaderboard, onShowShop, onShowProfile }) => {
  const [difficulty, setDifficulty] = useState("medium");

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-black text-cyan-400 mb-2">
            UNO <span className="text-pink-400">ELITE</span>
          </h1>
          <p className="text-gray-400">Welcome, {user.name}!</p>
        </div>

        <div className="bg-gray-800/50 rounded-xl p-6 mb-6 border border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-400">💰 Coins</span>
            <span className="text-yellow-400 font-bold">{user.coins || 0}</span>
          </div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-400">🔥 Streak</span>
            <span className="text-orange-400 font-bold">{user.streak || 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">🏆 Wins</span>
            <span className="text-green-400 font-bold">{user.winsTotal || 0}</span>
          </div>
        </div>

        <div className="mb-6">
          <div className="text-gray-400 text-sm mb-2">Difficulty</div>
          <div className="flex gap-2">
            {["easy", "medium", "hard"].map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`flex-1 py-3 font-bold rounded-lg transition-all ${
                  difficulty === d
                    ? d === "easy"
                      ? "bg-green-600 text-white"
                      : d === "medium"
                      ? "bg-yellow-600 text-black"
                      : "bg-red-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
          <div className="text-center text-gray-500 text-sm mt-2">
            Reward: +{difficulty === "easy" ? 10 : difficulty === "medium" ? 20 : 30} coins
          </div>
        </div>

        <button
          onClick={() => onStartGame(difficulty)}
          className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xl font-black rounded-xl hover:from-cyan-500 hover:to-blue-500 transition-all shadow-lg hover:shadow-cyan-500/30 mb-4"
        >
          🎮 PLAY VS BOT
        </button>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <button
            onClick={onShowProfile}
            className="py-3 bg-gray-800 text-gray-300 font-bold rounded-lg hover:bg-gray-700 transition-all"
          >
            👤
          </button>
          <button
            onClick={onShowLeaderboard}
            className="py-3 bg-gray-800 text-gray-300 font-bold rounded-lg hover:bg-gray-700 transition-all"
          >
            🏆
          </button>
          <button
            onClick={onShowShop}
            className="py-3 bg-gray-800 text-gray-300 font-bold rounded-lg hover:bg-gray-700 transition-all"
          >
            🛒
          </button>
        </div>

        <button
          onClick={onLogout}
          className="w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition-all"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

// ============ GAME SCREEN ============
const GameScreen = ({
  game,
  hand,
  playerIndex,
  onPlayCard,
  onDraw,
  onCallUno,
  onLeave,
  user,
}) => {
  const [choosingColor, setChoosingColor] = useState(false);
  const [pendingCard, setPendingCard] = useState(null);
  const playSound = useSoundEffects();

  const isMyTurn = game.currentPlayerIndex === playerIndex;
  const myPlayer = game.players[playerIndex];
  const opponent = game.players[1 - playerIndex];

  const canPlayCard = (card) => {
    if (!isMyTurn) return false;

    // If there's a draw pending, can only play +2 or +4
    if (game.drawPending > 0) {
      if (game.discardTop.value === "draw2") {
        return card.value === "draw2" || card.value === "wild4";
      }
      if (game.discardTop.value === "wild4") {
        return card.value === "wild4";
      }
    }

    if (card.color === "wild") return true;
    return (
      card.color === game.currentColor || card.value === game.discardTop.value
    );
  };

  const handleCardClick = (card) => {
    if (!canPlayCard(card)) {
      playSound("invalid");
      return;
    }

    if (card.color === "wild") {
      setPendingCard(card);
      setChoosingColor(true);
    } else {
      playSound("cardPlay");
      onPlayCard(card.id, null);
    }
  };

  const handleColorChoice = (color) => {
    if (pendingCard) {
      playSound("special");
      onPlayCard(pendingCard.id, color);
      setPendingCard(null);
      setChoosingColor(false);
    }
  };

  const handleDraw = () => {
    if (!isMyTurn) return;
    playSound("cardDraw");
    onDraw();
  };

  const handleUno = () => {
    if (hand.length === 2) {
      playSound("uno");
      onCallUno();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-3 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={onLeave}
            className="px-3 py-1 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 text-sm"
          >
            ← Leave
          </button>
          <div className="text-cyan-400 font-bold">
            {game.difficulty.toUpperCase()}
          </div>
          <div className="text-yellow-400 font-bold">💰 {user.coins || 0}</div>
        </div>

        {/* Opponent */}
        <div className="mb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-red-400 font-bold">
              🤖 {opponent?.name} [{opponent?.handSize}]
            </span>
            {opponent?.handSize === 1 && (
              <span className="bg-yellow-500 text-black px-2 py-0.5 rounded font-bold text-xs animate-pulse">
                UNO!
              </span>
            )}
          </div>
          <CardBack count={opponent?.handSize || 0} difficulty={game.difficulty} />
        </div>

        {/* Play Area */}
        <div className="bg-gradient-to-br from-green-900/80 to-emerald-900/80 rounded-xl p-4 sm:p-6 mb-4 border-4 border-green-600">
          <div className="flex justify-center items-center gap-4 sm:gap-8">
            {/* Draw Pile */}
            <div
              onClick={handleDraw}
              className={`w-20 h-28 sm:w-24 sm:h-32 bg-gradient-to-br from-gray-900 to-black border-4 border-gray-600 rounded-xl flex flex-col items-center justify-center ${
                isMyTurn
                  ? "cursor-pointer hover:border-yellow-400 hover:scale-105"
                  : "opacity-50"
              } transition-all`}
            >
              <span className="text-3xl sm:text-4xl mb-1">🃏</span>
              <span className="text-cyan-400 text-sm font-bold">
                {game.deckSize}
              </span>
            </div>

            {/* Discard Pile */}
            <div>
              {game.discardTop && <Card card={game.discardTop} disabled />}
              {game.currentColor !== game.discardTop?.color && (
                <div
                  className={`mt-2 text-center text-sm font-bold ${
                    game.currentColor === "red"
                      ? "text-red-400"
                      : game.currentColor === "yellow"
                      ? "text-yellow-400"
                      : game.currentColor === "green"
                      ? "text-green-400"
                      : "text-blue-400"
                  }`}
                >
                  Color: {game.currentColor}
                </div>
              )}
            </div>

            {/* Turn Indicator */}
            <div
              className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-2xl border-4 ${
                isMyTurn
                  ? "bg-cyan-600 border-cyan-400 animate-pulse"
                  : "bg-red-600 border-red-400"
              }`}
            >
              {isMyTurn ? "👤" : "🤖"}
            </div>
          </div>

          {/* Status Message */}
          <div className="mt-4 text-center">
            <div className="bg-black/50 py-2 px-4 rounded-lg inline-block">
              <span className="text-cyan-400 font-bold">
                {game.drawPending > 0
                  ? `Draw ${game.drawPending} or stack!`
                  : isMyTurn
                  ? "Your turn!"
                  : "Opponent's turn..."}
              </span>
            </div>
          </div>

          {/* Color Chooser */}
          {choosingColor && (
            <div className="mt-4 flex justify-center gap-3">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorChoice(color)}
                  className={`w-12 h-12 sm:w-14 sm:h-14 ${colorStyles[color]} border-4 border-white rounded-lg hover:scale-125 transition-all`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Player Hand */}
        <div className="mb-4">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="text-blue-400 font-bold">
              👤 You [{hand.length}]
            </span>
            {hand.length === 2 && (
              <button
                onClick={handleUno}
                className="px-3 py-1 bg-yellow-500 text-black font-bold rounded-lg hover:scale-110 transition-all animate-pulse"
              >
                🔔 UNO!
              </button>
            )}
            {myPlayer?.calledUno && hand.length <= 2 && (
              <span className="bg-yellow-500 text-black px-2 py-0.5 rounded font-bold text-xs">
                UNO!
              </span>
            )}
          </div>

          <div className="flex justify-center gap-1 sm:gap-2 flex-wrap min-h-[120px] items-end px-2">
            {hand.map((card, index) => (
              <Card
                key={card.id}
                card={card}
                onClick={() => handleCardClick(card)}
                disabled={!isMyTurn || (choosingColor && pendingCard?.id !== card.id)}
                highlight={isMyTurn && canPlayCard(card)}
                index={index}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ MAIN APP COMPONENT ============
export default function UnoGame() {
  // App state
  const [screen, setScreen] = useState("loading"); // loading, auth, menu, game
  const [user, setUser] = useState(null);

  // Game state
  const [game, setGame] = useState(null);
  const [hand, setHand] = useState([]);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [rewards, setRewards] = useState(null);

  // Modals
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // Loading states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const playSound = useSoundEffects();

  // Check for existing session on mount
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
    setError("");

    const res = await api.createGame(difficulty, true);

    if (res.success) {
      setGame(res.data.game);
      setHand(res.data.hand);
      setPlayerIndex(0);
      setGameOver(false);
      setRewards(null);
      setScreen("game");
    } else {
      setError(res.error || "Failed to create game");
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
        playSound(res.data.youWon ? "win" : "lose");

        // Update user coins
        if (res.data.rewards?.coinsAwarded) {
          setUser((prev) => ({
            ...prev,
            coins: (prev.coins || 0) + res.data.rewards.coinsAwarded,
            streak: res.data.rewards.newStreak || prev.streak,
          }));
        }
      }
    } else {
      playSound("invalid");
      setError(res.error);
    }
  };

  const handleDraw = async () => {
    if (!game) return;

    const res = await api.drawCard(game.id);

    if (res.success) {
      setGame(res.data.game);
      setHand(res.data.hand);

      if (res.data.gameEnded) {
        setGameOver(true);
        playSound(res.data.youWon ? "win" : "lose");
      }
    }
  };

  const handleCallUno = async () => {
    if (!game) return;
    await api.callUno(game.id);
    playSound("uno");
  };

  const handleLeaveGame = async () => {
    if (game) {
      await api.leaveGame(game.id);
    }
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

  const handleShopPurchase = (purchaseData) => {
    playSound("coins");
    setUser((prev) => ({
      ...prev,
      coins: purchaseData.newBalance,
      cosmetics: {
        ...prev.cosmetics,
        owned: purchaseData.ownedCosmetics,
      },
    }));
  };

  // Render based on screen state
  if (screen === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <div className="text-cyan-400 text-2xl font-bold animate-pulse">
          Loading...
        </div>
      </div>
    );
  }

  if (screen === "auth") {
    return <AuthModal onAuth={handleAuth} />;
  }

  if (screen === "menu") {
    return (
      <>
        <MainMenu
          user={user}
          onStartGame={handleStartGame}
          onLogout={handleLogout}
          onShowLeaderboard={() => setShowLeaderboard(true)}
          onShowShop={() => setShowShop(true)}
          onShowProfile={() => setShowProfile(true)}
        />

        {showLeaderboard && (
          <LeaderboardModal onClose={() => setShowLeaderboard(false)} />
        )}

        {showShop && (
          <ShopModal
            user={user}
            onClose={() => setShowShop(false)}
            onPurchase={handleShopPurchase}
          />
        )}

        {showProfile && (
          <ProfileModal
            user={user}
            onClose={() => setShowProfile(false)}
          />
        )}

        {loading && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="text-cyan-400 text-xl font-bold animate-pulse">
              Creating game...
            </div>
          </div>
        )}

        {error && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg z-50">
            {error}
            <button
              onClick={() => setError("")}
              className="ml-4 text-white/80 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}
      </>
    );
  }

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
