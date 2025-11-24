"use client";

import { useState } from "react";
import Link from "next/link";
import ImprovedUnoGame from "@/components/ImprovedUnoGame";

export default function Home() {
  const [mode, setMode] = useState("menu");

  if (mode === "menu") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4">
        <div className="max-w-md w-full bg-black/80 border-4 border-cyan-400 rounded-xl p-8 backdrop-blur-sm shadow-[0_0_50px_rgba(34,211,238,0.3)]">
          <h1 className="text-5xl font-black text-center mb-2 bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 text-transparent bg-clip-text">
            UNO
          </h1>
          <p className="text-center text-gray-400 text-sm mb-8">
            Choose your game mode
          </p>

          <button
            onClick={() => setMode("singleplayer")}
            className="w-full px-6 py-4 mb-4 bg-gradient-to-r from-green-600 to-emerald-600 border-2 border-green-400 text-white font-bold text-lg rounded-lg hover:shadow-[0_0_20px_rgba(74,222,128,0.5)] transition-all transform hover:scale-105"
          >
            🤖 PLAY vs AI
          </button>

          <Link href="/multiplayer">
            <button className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 border-2 border-purple-400 text-white font-bold text-lg rounded-lg hover:shadow-[0_0_20px_rgba(168,85,247,0.5)] transition-all transform hover:scale-105">
              🌐 MULTIPLAYER ONLINE
            </button>
          </Link>

          <div className="mt-8 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="text-gray-400 text-xs text-center space-y-2">
              <div>
                <span className="font-bold text-green-400">
                  🤖 Single Player:
                </span>{" "}
                Play against AI
              </div>
              <div>
                <span className="font-bold text-purple-400">
                  🌐 Multiplayer:
                </span>{" "}
                Play with friends online
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "singleplayer") {
    return (
      <div>
        <div className="absolute top-4 left-4 z-50">
          <button
            onClick={() => setMode("menu")}
            className="px-4 py-2 bg-gray-800 border-2 border-gray-600 text-white font-bold rounded-lg hover:border-cyan-400 transition-all"
          >
            ← BACK TO MENU
          </button>
        </div>

        <ImprovedUnoGame />
      </div>
    );
  }

  return null;
}
