"use client";

import React, { useState, useEffect, useRef } from "react";

const COLORS = ["red", "yellow", "green", "blue"];

// Enhanced color styles with realistic card design
const colorStyles = {
  red: "bg-gradient-to-br from-red-600 via-red-500 to-red-700",
  yellow: "bg-gradient-to-br from-yellow-400 via-yellow-300 to-yellow-500",
  green: "bg-gradient-to-br from-green-600 via-green-500 to-green-700",
  blue: "bg-gradient-to-br from-blue-600 via-blue-500 to-blue-700",
  wild: "bg-gradient-to-br from-gray-900 via-gray-800 to-black",
};

// Sound effect generator using Web Audio API with game-quality voice synthesis
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

  // Create game-quality voice using additive synthesis (multiple harmonics)
  const createVoice = (text, baseFreq, duration) => {
    if (!audioContextRef.current) return;

    const ctx = audioContextRef.current;
    const now = ctx.currentTime;

    // Voice synthesis with formants (vowel sounds)
    const formants = {
      U: [300, 870, 2240], // "oo" sound in UNO
      O: [500, 700, 2600], // "oh" sound
      N: [280, 2200, 2600], // nasal sound
      A: [850, 1220, 2810], // "ah" sound
      I: [270, 2290, 3010], // "ee" sound
    };

    // Create a rich, human-like voice
    text.split("").forEach((char, index) => {
      const freq = formants[char] || [baseFreq];
      const startTime = now + (index * duration) / text.length;

      freq.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = i === 0 ? "sawtooth" : "sine";
        osc.frequency.setValueAtTime(f, startTime);

        filter.type = "bandpass";
        filter.frequency.setValueAtTime(f, startTime);
        filter.Q.setValueAtTime(10, startTime);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        const vol = i === 0 ? 0.15 : 0.08;
        gain.gain.setValueAtTime(vol, startTime);
        gain.gain.exponentialRampToValueAtTime(
          0.01,
          startTime + duration / text.length
        );

        osc.start(startTime);
        osc.stop(startTime + duration / text.length);
      });
    });
  };

  const playSound = (type) => {
    if (!audioContextRef.current) return;

    const ctx = audioContextRef.current;

    switch (type) {
      case "cardPlay":
        // Card slide sound - quick swoosh
        const cardOsc = ctx.createOscillator();
        const cardGain = ctx.createGain();
        const cardFilter = ctx.createBiquadFilter();

        cardOsc.type = "sine";
        cardFilter.type = "lowpass";
        cardFilter.frequency.setValueAtTime(800, ctx.currentTime);

        cardOsc.connect(cardFilter);
        cardFilter.connect(cardGain);
        cardGain.connect(ctx.destination);

        cardOsc.frequency.setValueAtTime(500, ctx.currentTime);
        cardOsc.frequency.exponentialRampToValueAtTime(
          200,
          ctx.currentTime + 0.08
        );
        cardGain.gain.setValueAtTime(0.2, ctx.currentTime);
        cardGain.gain.exponentialRampToValueAtTime(
          0.01,
          ctx.currentTime + 0.08
        );

        cardOsc.start(ctx.currentTime);
        cardOsc.stop(ctx.currentTime + 0.08);
        break;

      case "cardDraw":
        // Card pickup - crisp snap
        const drawOsc = ctx.createOscillator();
        const drawGain = ctx.createGain();

        drawOsc.type = "triangle";
        drawOsc.connect(drawGain);
        drawGain.connect(ctx.destination);

        drawOsc.frequency.setValueAtTime(350, ctx.currentTime);
        drawOsc.frequency.exponentialRampToValueAtTime(
          500,
          ctx.currentTime + 0.05
        );
        drawGain.gain.setValueAtTime(0.2, ctx.currentTime);
        drawGain.gain.exponentialRampToValueAtTime(
          0.01,
          ctx.currentTime + 0.05
        );

        drawOsc.start(ctx.currentTime);
        drawOsc.stop(ctx.currentTime + 0.05);
        break;

      case "uno":
        // Epic "UNO!" announcement with fanfare
        createVoice("UNO", 400, 0.6);

        // Add celebratory chord progression
        setTimeout(() => {
          [440, 554.37, 659.25].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
            gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(
              0.01,
              ctx.currentTime + i * 0.1 + 0.3
            );
            osc.start(ctx.currentTime + i * 0.1);
            osc.stop(ctx.currentTime + i * 0.1 + 0.3);
          });
        }, 100);
        break;

      case "win":
        // Victory fanfare
        const winMelody = [523.25, 659.25, 783.99, 1046.5];
        winMelody.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
          gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.12);
          gain.gain.exponentialRampToValueAtTime(
            0.01,
            ctx.currentTime + i * 0.12 + 0.25
          );
          osc.start(ctx.currentTime + i * 0.12);
          osc.stop(ctx.currentTime + i * 0.12 + 0.25);
        });
        break;

      case "aiwin":
        // Ominous AI victory
        [196, 233.08, 261.63].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
          gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.15);
          gain.gain.exponentialRampToValueAtTime(
            0.01,
            ctx.currentTime + i * 0.15 + 0.3
          );
          osc.start(ctx.currentTime + i * 0.15);
          osc.stop(ctx.currentTime + i * 0.15 + 0.3);
        });
        break;

      case "special":
        // Wild card magical sound
        [400, 500, 600, 700, 800].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          osc.type = "sine";
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(2000, ctx.currentTime + i * 0.05);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);

          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.05);
          gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.05);
          gain.gain.exponentialRampToValueAtTime(
            0.01,
            ctx.currentTime + i * 0.05 + 0.15
          );

          osc.start(ctx.currentTime + i * 0.05);
          osc.stop(ctx.currentTime + i * 0.05 + 0.15);
        });
        break;

      case "skip":
        // Skip whoosh
        const skipOsc = ctx.createOscillator();
        const skipGain = ctx.createGain();
        skipOsc.type = "sawtooth";
        skipOsc.connect(skipGain);
        skipGain.connect(ctx.destination);
        skipOsc.frequency.setValueAtTime(600, ctx.currentTime);
        skipOsc.frequency.exponentialRampToValueAtTime(
          200,
          ctx.currentTime + 0.15
        );
        skipGain.gain.setValueAtTime(0.25, ctx.currentTime);
        skipGain.gain.exponentialRampToValueAtTime(
          0.01,
          ctx.currentTime + 0.15
        );
        skipOsc.start(ctx.currentTime);
        skipOsc.stop(ctx.currentTime + 0.15);
        break;

      case "reverse":
        // Reverse swoosh (up then down)
        const revOsc = ctx.createOscillator();
        const revGain = ctx.createGain();
        revOsc.type = "triangle";
        revOsc.connect(revGain);
        revGain.connect(ctx.destination);
        revOsc.frequency.setValueAtTime(300, ctx.currentTime);
        revOsc.frequency.exponentialRampToValueAtTime(
          600,
          ctx.currentTime + 0.08
        );
        revOsc.frequency.exponentialRampToValueAtTime(
          300,
          ctx.currentTime + 0.16
        );
        revGain.gain.setValueAtTime(0.25, ctx.currentTime);
        revGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.16);
        revOsc.start(ctx.currentTime);
        revOsc.stop(ctx.currentTime + 0.16);
        break;

      case "draw2":
        // Two quick pops
        [0, 0.08].forEach((time) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "square";
          osc.frequency.setValueAtTime(350, ctx.currentTime + time);
          gain.gain.setValueAtTime(0.2, ctx.currentTime + time);
          gain.gain.exponentialRampToValueAtTime(
            0.01,
            ctx.currentTime + time + 0.06
          );
          osc.start(ctx.currentTime + time);
          osc.stop(ctx.currentTime + time + 0.06);
        });
        break;

      case "wild4":
        // Four dramatic notes
        [400, 450, 500, 550].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
          gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(
            0.01,
            ctx.currentTime + i * 0.08 + 0.1
          );
          osc.start(ctx.currentTime + i * 0.08);
          osc.stop(ctx.currentTime + i * 0.08 + 0.1);
        });
        break;

      case "invalid":
        // Error buzz
        const errOsc = ctx.createOscillator();
        const errGain = ctx.createGain();
        errOsc.type = "square";
        errOsc.connect(errGain);
        errGain.connect(ctx.destination);
        errOsc.frequency.setValueAtTime(180, ctx.currentTime);
        errOsc.frequency.setValueAtTime(120, ctx.currentTime + 0.08);
        errGain.gain.setValueAtTime(0.25, ctx.currentTime);
        errGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        errOsc.start(ctx.currentTime);
        errOsc.stop(ctx.currentTime + 0.15);
        break;

      case "shuffle":
        // Realistic card shuffle - multiple rapid card sounds
        for (let i = 0; i < 8; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          osc.type = "white";
          filter.type = "bandpass";
          filter.frequency.setValueAtTime(
            800 + Math.random() * 400,
            ctx.currentTime + i * 0.04
          );
          filter.Q.setValueAtTime(5, ctx.currentTime + i * 0.04);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);

          osc.frequency.setValueAtTime(
            300 + Math.random() * 200,
            ctx.currentTime + i * 0.04
          );
          gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.04);
          gain.gain.exponentialRampToValueAtTime(
            0.01,
            ctx.currentTime + i * 0.04 + 0.04
          );

          osc.start(ctx.currentTime + i * 0.04);
          osc.stop(ctx.currentTime + i * 0.04 + 0.04);
        }
        break;
    }
  };

  return playSound;
};

const createDeck = () => {
  const deck = [];
  COLORS.forEach((color) => {
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
  return deck.sort(() => Math.random() - 0.5);
};

const getCardValue = (card) => {
  if (card.value === "wild4" || card.value === "wild") return 50;
  if (
    card.value === "draw2" ||
    card.value === "skip" ||
    card.value === "reverse"
  )
    return 20;
  return parseInt(card.value);
};

const Card = ({
  card,
  onClick,
  disabled,
  small,
  highlight,
  index,
  isAnimating,
}) => {
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

  const baseClasses = `${
    small
      ? "w-12 h-16 sm:w-14 sm:h-20 md:w-16 md:h-24"
      : "w-16 h-24 sm:w-20 sm:h-32"
  } ${
    colorStyles[card.color]
  } rounded-lg sm:rounded-xl flex items-center justify-center font-bold shadow-2xl border-4 sm:border-[6px] transition-all duration-300 relative overflow-hidden`;

  const interactiveClasses = disabled
    ? "opacity-50 cursor-not-allowed"
    : "cursor-pointer hover:scale-110 hover:-translate-y-2 sm:hover:-translate-y-4 hover:rotate-2 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)]";

  const highlightClasses = highlight
    ? "ring-2 sm:ring-4 ring-yellow-400 scale-105 shadow-[0_0_30px_rgba(255,215,0,0.6)]"
    : "";

  const animatingClasses = isAnimating
    ? "animate-[flyToDiscard_0.5s_ease-in-out]"
    : "";

  const borderColor = isWild ? "border-gray-300" : "border-white";

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={`${baseClasses} ${interactiveClasses} ${highlightClasses} ${animatingClasses} ${borderColor}`}
      style={{
        transform: `translateY(${index * -2}px) ${
          highlight ? "scale(1.05)" : ""
        }`,
        zIndex: highlight ? 100 : index,
        boxShadow: `
          0 10px 30px rgba(0,0,0,0.4),
          inset 0 1px 0 rgba(255,255,255,0.3),
          inset 0 -1px 0 rgba(0,0,0,0.3)
        `,
      }}
    >
      {/* Card shine effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent rounded-lg sm:rounded-xl pointer-events-none" />

      {/* Decorative pattern for wild cards */}
      {isWild && (
        <div
          className="absolute inset-2 rounded-lg border-2 sm:border-4 border-dashed opacity-20"
          style={{
            borderColor:
              "repeating-linear-gradient(45deg, #ff0000, #ffff00 25%, #00ff00 50%, #0000ff 75%, #ff0000)",
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-red-500 via-yellow-500 via-green-500 to-blue-500 opacity-30 blur-sm" />
          </div>
        </div>
      )}

      <div className="text-center relative w-full h-full flex items-center justify-center z-10">
        {/* Main card value */}
        <span
          className={`${
            small ? "text-xl sm:text-2xl" : "text-3xl sm:text-5xl"
          } font-black ${
            isWild ? "text-white" : "text-white"
          } drop-shadow-[3px_3px_6px_rgba(0,0,0,0.8)]`}
          style={{
            textShadow: `
              2px 2px 4px rgba(0,0,0,0.8),
              -1px -1px 2px rgba(255,255,255,0.3)
            `,
          }}
        >
          {displayValue}
        </span>

        {/* Corner indicators */}
        {!small && (
          <>
            <div
              className={`absolute top-1 left-1 sm:top-2 sm:left-2 text-[10px] sm:text-xs font-bold ${
                isWild ? "text-white" : "text-white"
              } opacity-80`}
            >
              {displayValue}
            </div>
            <div
              className={`absolute bottom-1 right-1 sm:bottom-2 sm:right-2 text-[10px] sm:text-xs font-bold ${
                isWild ? "text-white" : "text-white"
              } opacity-80 rotate-180`}
            >
              {displayValue}
            </div>
          </>
        )}
      </div>

      {/* Card edge highlight */}
      <div className="absolute inset-0 rounded-lg sm:rounded-xl border-2 border-white/10 pointer-events-none" />
    </div>
  );
};

export default function ImprovedUnoGame() {
  const [deck, setDeck] = useState([]);
  const [playerHand, setPlayerHand] = useState([]);
  const [aiHand, setAiHand] = useState([]);
  const [discardPile, setDiscardPile] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState("player");
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [message, setMessage] = useState("");
  const [unoState, setUnoState] = useState({ player: false, ai: false });
  const [choosingColor, setChoosingColor] = useState(false);
  const [playerWins, setPlayerWins] = useState(0);
  const [aiWins, setAiWins] = useState(0);
  const [drawPending, setDrawPending] = useState(0);
  const [difficulty, setDifficulty] = useState("easy");
  const [drewCard, setDrewCard] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [learningFlash, setLearningFlash] = useState(false);
  const [animatingCardId, setAnimatingCardId] = useState(null);

  const aiTurnTimeout = useRef(null);
  const gameInitialized = useRef(false);
  const playSound = useSoundEffects();

  const aiMemory = useRef({
    playerColors: { red: 0, yellow: 0, green: 0, blue: 0 },
    playerActionCards: 0,
    playerWilds: 0,
    turnsPlayed: 0,
    colorAfterWild: { red: 0, yellow: 0, green: 0, blue: 0 },
    cardSequences: [],
    drawFrequency: 0,
    aggressiveness: 0,
    unoCallReliability: 1,
    bluffDetection: 0,
    riskTolerance: 0.5,
    wins: 0,
    losses: 0,
    totalGames: 0,
    averageCardsWhenWon: 0,
    confidenceLevel: 0,
    adaptationRate: 1.0,
    playerStackingTendency: 0,
    recentMoves: [],
    colorPreferences: { red: 0, yellow: 0, green: 0, blue: 0 },
    defensivePlayCount: 0,
    aggressivePlayCount: 0,
  });

  useEffect(() => {
    if (!gameInitialized.current) {
      startNewGame();
      gameInitialized.current = true;
    }
  }, []);

  useEffect(() => {
    if (
      currentPlayer === "ai" &&
      !gameOver &&
      !choosingColor &&
      !isProcessing
    ) {
      if (aiTurnTimeout.current) {
        clearTimeout(aiTurnTimeout.current);
      }
      aiTurnTimeout.current = setTimeout(() => {
        executeAiTurn();
      }, 1000);
    }

    return () => {
      if (aiTurnTimeout.current) {
        clearTimeout(aiTurnTimeout.current);
      }
    };
  }, [currentPlayer, gameOver, choosingColor, isProcessing]);

  const startNewGame = () => {
    if (aiTurnTimeout.current) clearTimeout(aiTurnTimeout.current);

    playSound("shuffle");

    const newDeck = createDeck();
    const playerCards = newDeck.splice(0, 7);
    const aiCards = newDeck.splice(0, 7);
    let firstCard = newDeck.splice(0, 1)[0];

    while (
      firstCard.color === "wild" ||
      firstCard.value === "draw2" ||
      firstCard.value === "skip" ||
      firstCard.value === "reverse"
    ) {
      newDeck.push(firstCard);
      firstCard = newDeck.splice(0, 1)[0];
    }

    setDeck(newDeck);
    setPlayerHand(sortHand(playerCards));
    setAiHand(aiCards);
    setDiscardPile([firstCard]);
    setCurrentPlayer("player");
    setGameOver(false);
    setWinner(null);
    setMessage("Your turn");
    setUnoState({ player: false, ai: false });
    setChoosingColor(false);
    setDrawPending(0);
    setDrewCard(false);
    setIsProcessing(false);
    setAnimatingCardId(null);

    aiMemory.current.turnsPlayed = 0;
    aiMemory.current.cardSequences = [];
    aiMemory.current.totalGames++;
    aiMemory.current.confidenceLevel = Math.min(
      1.0,
      aiMemory.current.confidenceLevel + 0.05
    );

    const decayFactor = 0.85;
    Object.keys(aiMemory.current.playerColors).forEach((color) => {
      aiMemory.current.playerColors[color] *= decayFactor;
    });
    Object.keys(aiMemory.current.colorAfterWild).forEach((color) => {
      aiMemory.current.colorAfterWild[color] *= decayFactor;
    });
  };

  const sortHand = (hand) => {
    return [...hand].sort((a, b) => {
      const colorOrder = { red: 0, yellow: 1, green: 2, blue: 3, wild: 4 };
      if (colorOrder[a.color] !== colorOrder[b.color]) {
        return colorOrder[a.color] - colorOrder[b.color];
      }
      return getCardValue(a) - getCardValue(b);
    });
  };

  const reshuffleDeck = (currentDeck, currentDiscard) => {
    if (currentDeck.length === 0 && currentDiscard.length > 1) {
      const topCard = currentDiscard[currentDiscard.length - 1];
      const newDeck = currentDiscard
        .slice(0, -1)
        .sort(() => Math.random() - 0.5);
      return { newDeck, newDiscard: [topCard] };
    }
    return { newDeck: currentDeck, newDiscard: currentDiscard };
  };

  const drawCards = (player, count) => {
    playSound("cardDraw");
    let currentDeck = [...deck];
    let currentDiscard = [...discardPile];
    const drawnCards = [];

    for (let i = 0; i < count; i++) {
      if (currentDeck.length === 0) {
        const reshuffled = reshuffleDeck(currentDeck, currentDiscard);
        currentDeck = reshuffled.newDeck;
        currentDiscard = reshuffled.newDiscard;
        if (currentDeck.length === 0) break;
      }
      drawnCards.push(currentDeck[0]);
      currentDeck = currentDeck.slice(1);
    }

    setDeck(currentDeck);
    setDiscardPile(currentDiscard);

    if (player === "player") {
      setPlayerHand((prev) => sortHand([...prev, ...drawnCards]));
    } else {
      setAiHand((prev) => [...prev, ...drawnCards]);
    }

    return drawnCards;
  };

  const canPlayCard = (card, topCard) => {
    if (card.color === "wild") return true;
    if (topCard.color === "wild") return true;
    return card.color === topCard.color || card.value === topCard.value;
  };

  const getPlayableCards = (hand, topCard) => {
    return hand.filter((card) => canPlayCard(card, topCard));
  };

  const endGame = (winningPlayer) => {
    setGameOver(true);
    setWinner(winningPlayer);

    if (winningPlayer === "player") {
      playSound("win");
    } else {
      playSound("aiwin");
    }

    if (winningPlayer === "ai") {
      aiMemory.current.wins++;
      aiMemory.current.averageCardsWhenWon =
        (aiMemory.current.averageCardsWhenWon * (aiMemory.current.wins - 1) +
          playerHand.length) /
        aiMemory.current.wins;
      setAiWins((prev) => prev + 1);
      setMessage("AI wins this round!");
    } else {
      aiMemory.current.losses++;
      aiMemory.current.adaptationRate = Math.min(
        2.0,
        aiMemory.current.adaptationRate + 0.15
      );
      setPlayerWins((prev) => prev + 1);
      setMessage("You win this round!");
    }

    const finalPlayerColors = COLORS.reduce((acc, color) => {
      acc[color] = playerHand.filter((c) => c.color === color).length;
      return acc;
    }, {});

    Object.keys(finalPlayerColors).forEach((color) => {
      if (finalPlayerColors[color] > 2) {
        aiMemory.current.playerColors[color] += 8;
      }
    });

    setIsProcessing(false);
  };

  const updateAiMemory = (card, playerType, chosenColor = null) => {
    if (playerType === "player") {
      aiMemory.current.turnsPlayed++;

      setLearningFlash(true);
      setTimeout(() => setLearningFlash(false), 500);

      if (COLORS.includes(card.color)) {
        aiMemory.current.playerColors[card.color] +=
          aiMemory.current.adaptationRate * 1.5;
        aiMemory.current.colorPreferences[card.color] += 1;
      }

      if (["skip", "reverse", "draw2"].includes(card.value)) {
        aiMemory.current.playerActionCards++;
        aiMemory.current.aggressivePlayCount++;
        aiMemory.current.aggressiveness =
          aiMemory.current.aggressivePlayCount /
          Math.max(1, aiMemory.current.turnsPlayed);
      }

      if (card.color === "wild") {
        aiMemory.current.playerWilds++;
        if (chosenColor) {
          aiMemory.current.colorAfterWild[chosenColor] += 3;
          aiMemory.current.colorPreferences[chosenColor] += 2;
        }
      }

      if (card.value === "draw2" || card.value === "wild4") {
        if (drawPending > 0) {
          aiMemory.current.playerStackingTendency += 0.2;
        }
      }

      aiMemory.current.cardSequences.push({
        color: card.color,
        value: card.value,
        turn: aiMemory.current.turnsPlayed,
        handSize: playerHand.length,
      });

      if (aiMemory.current.cardSequences.length > 20) {
        aiMemory.current.cardSequences.shift();
      }

      aiMemory.current.recentMoves.push({
        card: card,
        turn: aiMemory.current.turnsPlayed,
      });

      if (aiMemory.current.recentMoves.length > 10) {
        aiMemory.current.recentMoves.shift();
      }

      const highRiskCards = ["wild4", "draw2", "skip", "reverse"];
      if (highRiskCards.includes(card.value)) {
        aiMemory.current.riskTolerance = Math.min(
          1.0,
          aiMemory.current.riskTolerance + 0.08
        );
      } else {
        aiMemory.current.riskTolerance = Math.max(
          0,
          aiMemory.current.riskTolerance - 0.03
        );
      }
    } else {
      if (card.color === "wild" && chosenColor) {
        aiMemory.current.colorAfterWild[chosenColor] += 0.5;
      }
    }
  };

  const playCard = (card, playerType, chosenColor = null) => {
    if (isProcessing) return;

    const topCard = discardPile[discardPile.length - 1];

    if (!canPlayCard(card, topCard) && card.color !== "wild") {
      setMessage("Invalid card!");
      playSound("invalid");
      return;
    }

    // Check for card stacking
    if (drawPending > 0) {
      const canStack =
        (card.value === "draw2" && topCard.value === "draw2") ||
        (card.value === "wild4" &&
          (topCard.value === "wild4" || topCard.value === "draw2"));

      if (!canStack) {
        setMessage(`Must draw ${drawPending} or stack +2/+4!`);
        playSound("invalid");
        return;
      }
    }

    setIsProcessing(true);
    updateAiMemory(card, playerType, chosenColor);

    // Play appropriate sound
    if (card.value === "skip") {
      playSound("skip");
    } else if (card.value === "reverse") {
      playSound("reverse");
    } else if (card.value === "draw2") {
      playSound("draw2");
    } else if (card.value === "wild4") {
      playSound("wild4");
    } else if (card.value === "wild") {
      playSound("special");
    } else {
      playSound("cardPlay");
    }

    // Animate card
    setAnimatingCardId(card.id);
    setTimeout(() => setAnimatingCardId(null), 500);

    setTimeout(() => {
      let newHand;
      if (playerType === "player") {
        newHand = playerHand.filter((c) => c.id !== card.id);
        setPlayerHand(newHand);
        setDrewCard(false);
      } else {
        newHand = aiHand.filter((c) => c.id !== card.id);
        setAiHand(newHand);
      }

      if (newHand.length === 0) {
        const playedCard = chosenColor ? { ...card, color: chosenColor } : card;
        setDiscardPile((prev) => [...prev, playedCard]);
        endGame(playerType);
        return;
      }

      if (newHand.length === 1) {
        if (playerType === "player" && !unoState.player) {
          aiMemory.current.unoCallReliability = Math.max(
            0,
            aiMemory.current.unoCallReliability - 0.25
          );
          setMessage("UNO penalty! Drawing 2...");
          setTimeout(() => {
            drawCards("player", 2);
            continueAfterPlay(card, playerType, chosenColor, newHand);
          }, 1200);
          return;
        } else if (playerType === "ai" && !unoState.ai) {
          const callChance =
            difficulty === "easy" ? 0.2 : difficulty === "medium" ? 0.7 : 0.995; // Only 20% in easy!
          if (Math.random() > callChance) {
            setMessage("AI forgot UNO!");
            setTimeout(() => {
              drawCards("ai", 2);
              continueAfterPlay(card, playerType, chosenColor, newHand);
            }, 1200);
            return;
          } else {
            setUnoState((prev) => ({ ...prev, ai: true }));
            setMessage("AI calls UNO!");
            playSound("uno");
          }
        }
      }

      continueAfterPlay(card, playerType, chosenColor, newHand);
    }, 300);
  };

  const continueAfterPlay = (card, playerType, chosenColor, newHand) => {
    const playedCard = chosenColor ? { ...card, color: chosenColor } : card;
    setDiscardPile((prev) => [...prev, playedCard]);

    if (card.value === "wild" || card.value === "wild4") {
      if (playerType === "player" && !chosenColor) {
        setChoosingColor(true);
        setIsProcessing(false);
        return;
      }

      if (card.value === "wild4") {
        setDrawPending((prev) => prev + 4);
        setMessage(
          playerType === "player"
            ? "AI must draw 4 or stack!"
            : "You must draw 4 or stack!"
        );
      }
    } else if (card.value === "draw2") {
      setDrawPending((prev) => prev + 2);
      setMessage(
        playerType === "player"
          ? "AI must draw 2 or stack!"
          : "You must draw 2 or stack!"
      );
    } else if (card.value === "skip" || card.value === "reverse") {
      setMessage(playerType === "player" ? "AI skipped!" : "You're skipped!");
      setTimeout(() => {
        setIsProcessing(false);
      }, 700);
      return;
    }

    setTimeout(() => {
      switchPlayer();
    }, 500);
  };

  const switchPlayer = () => {
    const next = currentPlayer === "player" ? "ai" : "player";
    setCurrentPlayer(next);
    setIsProcessing(false);

    if (next === "player") {
      setMessage(
        drawPending > 0 ? `Draw ${drawPending} or stack +2/+4` : "Your turn"
      );
      setDrewCard(false);
    } else {
      setMessage("AI thinking...");
    }
  };

  const executeAiTurn = () => {
    if (gameOver || currentPlayer !== "ai" || isProcessing) return;

    setIsProcessing(true);
    const topCard = discardPile[discardPile.length - 1];

    if (aiHand.length === 2 && !unoState.ai) {
      const callChance =
        difficulty === "easy" ? 0.25 : difficulty === "medium" ? 0.75 : 0.995; // Only 25% in easy!
      if (Math.random() < callChance) {
        setUnoState((prev) => ({ ...prev, ai: true }));
        setMessage("AI calls UNO!");
        playSound("uno");
        setTimeout(() => continueAiPlay(topCard), 700);
        return;
      }
    }

    continueAiPlay(topCard);
  };

  const continueAiPlay = (topCard) => {
    const playableCards = getPlayableCards(aiHand, topCard);

    if (drawPending > 0) {
      const draw2Cards = playableCards.filter((c) => c.value === "draw2");
      const wild4Cards = playableCards.filter((c) => c.value === "wild4");

      // Smart stacking decision based on difficulty
      const shouldStack =
        difficulty === "easy"
          ? (draw2Cards.length > 0 || wild4Cards.length > 0) &&
            Math.random() > 0.85 // Only stack 15% of the time!
          : difficulty === "medium"
          ? (draw2Cards.length > 0 || wild4Cards.length > 0) &&
            Math.random() > 0.4 // Stack 60% of the time
          : (draw2Cards.length > 0 || wild4Cards.length > 0) &&
            Math.random() > 0.01; // Stack 99% of the time in hard mode!

      if (shouldStack) {
        if (draw2Cards.length > 0) {
          playCard(draw2Cards[0], "ai");
          return;
        } else if (wild4Cards.length > 0) {
          const bestColor = getSmartColorForAI();
          playCard(wild4Cards[0], "ai", bestColor);
          return;
        }
      }

      drawCards("ai", drawPending);
      setDrawPending(0);
      setMessage(`AI drew ${drawPending} cards`);
      setTimeout(() => {
        switchPlayer();
      }, 900);
      return;
    }

    if (playableCards.length > 0) {
      const cardToPlay = selectSmartCard(playableCards, topCard);
      const chosenColor =
        cardToPlay.color === "wild" ? getSmartColorForAI() : null;
      playCard(cardToPlay, "ai", chosenColor);
    } else {
      const drawn = drawCards("ai", 1);
      setMessage("AI draws");

      if (drawn.length > 0 && canPlayCard(drawn[0], topCard)) {
        setTimeout(() => {
          const playChance =
            difficulty === "easy" ? 0.35 : difficulty === "medium" ? 0.8 : 0.98; // Only 35% in easy!
          if (Math.random() < playChance) {
            setMessage("AI plays drawn card");
            setTimeout(() => {
              const chosenColor =
                drawn[0].color === "wild" ? getSmartColorForAI() : null;
              playCard(drawn[0], "ai", chosenColor);
            }, 400);
          } else {
            setTimeout(() => switchPlayer(), 700);
          }
        }, 700);
      } else {
        setTimeout(() => switchPlayer(), 900);
      }
    }
  };

  const selectSmartCard = (playableCards, topCard) => {
    if (difficulty === "easy") {
      // Easy: VERY random, bad decision making

      // 85% chance to just play completely random
      if (Math.random() < 0.85) {
        return playableCards[Math.floor(Math.random() * playableCards.length)];
      }

      // 15% chance to show some basic logic
      const wilds = playableCards.filter(
        (c) => c.value === "wild" || c.value === "wild4"
      );

      const normalCards = playableCards.filter(
        (c) => !["skip", "reverse", "draw2", "wild", "wild4"].includes(c.value)
      );

      // Prefer saving wilds and action cards if normal cards available
      if (normalCards.length > 0) {
        return normalCards[Math.floor(Math.random() * normalCards.length)];
      }

      return playableCards[Math.floor(Math.random() * playableCards.length)];
    }

    if (difficulty === "medium") {
      // Medium: Some strategy but not perfect
      const colorCounts = COLORS.reduce((acc, color) => {
        acc[color] = aiHand.filter((c) => c.color === color).length;
        return acc;
      }, {});

      const sortedColors = Object.entries(colorCounts).sort(
        (a, b) => b[1] - a[1]
      );
      const strongestColor = sortedColors[0][0];
      const weakestColor = sortedColors[sortedColors.length - 1][0];

      const scoreCard = (card) => {
        let score = Math.random() * 30; // Add randomness
        const baseValue = getCardValue(card);

        // Basic strategy
        if (aiHand.length <= 3) {
          // Try to win
          if (card.value === "wild" || card.value === "wild4") score += 80;
          if (["draw2", "skip", "reverse"].includes(card.value)) score += 60;
        } else if (aiHand.length <= 5) {
          // Play moderately aggressive
          if (["draw2", "skip", "reverse"].includes(card.value)) score += 40;
          if (card.color === strongestColor) score += 30;
        } else {
          // Get rid of weak colors
          if (card.color === weakestColor) score += 50;
          score += baseValue * 0.5;
        }

        return score;
      };

      const scoredCards = playableCards
        .map((card) => ({
          card,
          score: scoreCard(card),
        }))
        .sort((a, b) => b.score - a.score);

      // Pick from top 3 with some randomness
      const topCards = scoredCards.slice(0, Math.min(3, scoredCards.length));
      return topCards[Math.floor(Math.random() * topCards.length)].card;
    }

    // HARD MODE: Full advanced AI strategy
    const colorCounts = COLORS.reduce((acc, color) => {
      acc[color] = aiHand.filter((c) => c.color === color).length;
      return acc;
    }, {});

    const sortedColors = Object.entries(colorCounts).sort(
      (a, b) => b[1] - a[1]
    );
    const strongestColor = sortedColors[0][0];
    const weakestColor = sortedColors[sortedColors.length - 1][0];
    const hasStrongColor = colorCounts[strongestColor] >= 3;

    const sortedPlayerColors = Object.entries(
      aiMemory.current.playerColors
    ).sort((a, b) => b[1] - a[1]);
    const playerStrongColor = sortedPlayerColors[0][0];

    const playerWeakColors = COLORS.filter(
      (c) =>
        aiMemory.current.playerColors[c] <=
        aiMemory.current.playerColors[playerStrongColor] * 0.45
    );

    const recentColors = aiMemory.current.cardSequences
      .slice(-7)
      .map((s) => s.color);
    const playerColorStreak = recentColors.filter(
      (c) => c === recentColors[recentColors.length - 1]
    ).length;
    const isPlayerOnStreak = playerColorStreak >= 3;

    const estimatedPlayerHandSize = playerHand.length;
    const isPlayerDesperate = estimatedPlayerHandSize > aiHand.length + 3;
    const isAIDesperate = aiHand.length <= 3;

    const scoreCard = (card) => {
      let score = 0;
      const baseValue = getCardValue(card);

      score += baseValue * 0.6;

      // HARD MODE: Enhanced endgame strategy
      if (aiHand.length <= 2) {
        if (card.value === "wild4") score += 300; // Massively prioritize
        if (card.value === "wild") score += 250;
        if (card.value === "draw2") score += 220;
        if (card.value === "skip" || card.value === "reverse") score += 200;
        score += baseValue * 4;

        // HARD MODE BONUS: Hold back wilds if we have a playable card of our strongest color
        if (
          difficulty === "hard" &&
          (card.value === "wild" || card.value === "wild4")
        ) {
          const strongColorCards = playableCards.filter(
            (c) =>
              c.color === strongestColor &&
              c.value !== "wild" &&
              c.value !== "wild4"
          );
          if (strongColorCards.length > 0 && aiHand.length > 1) {
            score -= 150; // Save wilds for the killing blow
          }
        }
      } else if (aiHand.length <= 4) {
        if (card.value === "wild4" || card.value === "wild") score += 180;
        if (card.value === "draw2") score += 140;
        if (card.value === "skip" || card.value === "reverse") score += 100;
        if (card.color === strongestColor) score += 80;
        score += baseValue * 2.5;

        // HARD MODE: Psychological warfare - save action cards for critical moments
        if (difficulty === "hard" && playerHand.length <= 3) {
          if (["draw2", "wild4"].includes(card.value)) {
            score += 150; // Crush them when they're close to winning
          }
        }
      } else if (aiHand.length <= 7) {
        if (card.value === "draw2")
          score += 100 * aiMemory.current.aggressiveness;
        if (card.value === "skip" || card.value === "reverse") score += 90;
        if (playerWeakColors.includes(card.color)) score += 75;
        score += baseValue * 1.5;
      } else {
        if (card.color === weakestColor) score += 100;
        if (card.value === "draw2") score += 80;
        if (card.value === "skip" || card.value === "reverse") score += 70;
        score += baseValue * 1.2;
      }

      // Exploit player weaknesses MORE aggressively in hard mode
      if (playerWeakColors.includes(card.color)) {
        score +=
          difficulty === "hard"
            ? 80 * aiMemory.current.confidenceLevel
            : 50 * aiMemory.current.confidenceLevel;
      }

      // Break player streaks
      if (
        isPlayerOnStreak &&
        card.color !== recentColors[recentColors.length - 1]
      ) {
        score += difficulty === "hard" ? 70 : 45;
      }

      // Adapt to player aggression
      if (
        aiMemory.current.aggressiveness > 0.5 &&
        ["draw2", "skip", "reverse"].includes(card.value)
      ) {
        score += difficulty === "hard" ? 100 : 65;
      }

      // Counter defensive players MORE in hard mode
      if (aiMemory.current.aggressiveness < 0.25 && card.value === "wild4") {
        score += difficulty === "hard" ? 120 : 75;
      }

      // Wild card strategy
      if (card.color === "wild") {
        const sortedWildColors = Object.entries(
          aiMemory.current.colorAfterWild
        ).sort((a, b) => b[1] - a[1]);
        const playerFavoriteWildColor = sortedWildColors[0][0];

        if (colorCounts[playerFavoriteWildColor] >= 2) {
          score += difficulty === "hard" ? 70 : 40;
        }

        // Prefer wilds when player has many cards
        if (playerHand.length > aiHand.length + 2) {
          score += difficulty === "hard" ? 80 : 50;
        }
      }

      // Hold wilds strategically
      if (card.value === "wild" || card.value === "wild4") {
        if (
          hasStrongColor &&
          playableCards.some(
            (c) =>
              c.color === strongestColor &&
              c.value !== "wild" &&
              c.value !== "wild4"
          )
        ) {
          score -= difficulty === "hard" ? 80 : 60;
        }
        if (aiHand.length > 6 && !isPlayerDesperate) {
          score -= difficulty === "hard" ? 50 : 35;
        }
      }

      // Play strongest color
      if (card.color === strongestColor && hasStrongColor) {
        if (aiHand.length > 5) {
          score += difficulty === "hard" ? 60 : 45;
        } else if (aiHand.length > 2) {
          score += difficulty === "hard" ? 40 : 25;
        }
      }

      // Punish desperate players RUTHLESSLY in hard mode
      if (isPlayerDesperate && ["draw2", "wild4"].includes(card.value)) {
        score += difficulty === "hard" ? 150 : 90;
      }

      // Desperate AI plays
      if (isAIDesperate) {
        if (card.value === "wild" || card.value === "wild4") {
          score += difficulty === "hard" ? 180 : 100;
        }
        if (["draw2", "skip", "reverse"].includes(card.value)) {
          score += difficulty === "hard" ? 120 : 70;
        }
      }

      // Deck awareness - more aggressive in hard mode
      const deckRatio = deck.length / (deck.length + discardPile.length);
      if (deckRatio < 0.25 && baseValue > 30) {
        score += difficulty === "hard" ? 80 : 50;
      }

      // Learning from wins/losses - ENHANCED in hard mode
      const winRate =
        aiMemory.current.wins / Math.max(1, aiMemory.current.totalGames);
      if (winRate < 0.35) {
        if (["draw2", "skip", "reverse", "wild4"].includes(card.value)) {
          score +=
            difficulty === "hard"
              ? 100 * aiMemory.current.adaptationRate
              : 70 * aiMemory.current.adaptationRate;
        }
      } else if (winRate > 0.7 && difficulty === "hard") {
        // When winning a lot, become even MORE aggressive
        if (["draw2", "wild4"].includes(card.value)) {
          score += 60;
        }
      }

      // Color preference learning - ENHANCED
      if (COLORS.includes(card.color)) {
        const playerColorPref =
          aiMemory.current.colorPreferences[card.color] || 0;
        if (playerColorPref < 2) {
          score += difficulty === "hard" ? 55 : 35;
        }
      }

      // HARD MODE: Predict player's next move
      if (difficulty === "hard" && aiMemory.current.turnsPlayed > 8) {
        // If player keeps playing same color, assume they have more
        const recentPlayerColors = aiMemory.current.recentMoves
          .slice(-5)
          .map((m) => m.card.color)
          .filter((c) => COLORS.includes(c));

        if (recentPlayerColors.length >= 3) {
          const mostFrequent = recentPlayerColors.reduce((acc, color) => {
            acc[color] = (acc[color] || 0) + 1;
            return acc;
          }, {});

          const dominantColor = Object.entries(mostFrequent).sort(
            (a, b) => b[1] - a[1]
          )[0];

          if (dominantColor && dominantColor[1] >= 2) {
            // Avoid playing this color to starve the player
            if (card.color === dominantColor[0]) {
              score -= 90;
            }
          }
        }
      }

      // Randomness for medium difficulty
      if (difficulty === "medium") {
        score += Math.random() * 50 - 25;
      }

      // Minimal randomness for hard mode (mostly optimal play)
      if (difficulty === "hard") {
        score += Math.random() * 5 - 2.5; // Even less randomness
        score *= 1 + aiMemory.current.confidenceLevel * 0.5; // Higher confidence multiplier
      }

      return score;
    };

    const scoredCards = playableCards
      .map((card) => ({
        card,
        score: scoreCard(card),
      }))
      .sort((a, b) => b.score - a.score);

    // Hard mode: Pick best card 85% of time, second best 15% of time
    if (difficulty === "hard") {
      if (Math.random() < 0.85 || scoredCards.length === 1) {
        return scoredCards[0].card;
      } else if (scoredCards.length >= 2) {
        return scoredCards[1].card;
      }
    }

    return scoredCards[0].card;
  };

  const getSmartColorForAI = () => {
    const colorCounts = COLORS.reduce((acc, color) => {
      acc[color] = aiHand.filter((c) => c.color === color).length;
      return acc;
    }, {});

    const sortedPlayerColors = Object.entries(
      aiMemory.current.playerColors
    ).sort((a, b) => b[1] - a[1]);
    const playerStrongColor = sortedPlayerColors[0][0];

    const sortedWildColors = Object.entries(
      aiMemory.current.colorAfterWild
    ).sort((a, b) => b[1] - a[1]);
    const playerFavoriteWildColor = sortedWildColors[0][0];

    const recentPlayerColors = aiMemory.current.cardSequences
      .slice(-7)
      .filter((s) => COLORS.includes(s.color))
      .map((s) => s.color);

    const recentColorCounts = COLORS.reduce((acc, color) => {
      acc[color] = recentPlayerColors.filter((c) => c === color).length;
      return acc;
    }, {});

    const scoredColors = COLORS.map((color) => {
      let score = colorCounts[color] * 12;

      // Target weak colors MORE aggressively in hard mode
      if (
        aiMemory.current.playerColors[color] <=
        aiMemory.current.playerColors[playerStrongColor] * 0.35
      ) {
        score +=
          difficulty === "hard"
            ? 100 * aiMemory.current.confidenceLevel
            : 65 * aiMemory.current.confidenceLevel;
      }

      // Avoid recent colors
      if (recentColorCounts[color] >= 2) {
        score -= difficulty === "hard" ? 60 : 40;
      }

      // Avoid player favorite wild colors
      if (
        color !== playerFavoriteWildColor &&
        aiMemory.current.colorAfterWild[playerFavoriteWildColor] > 4
      ) {
        score += difficulty === "hard" ? 55 : 35;
      }

      // Multiple cards bonus
      const hasMultipleOfColor = colorCounts[color] >= 2;
      if (hasMultipleOfColor) {
        score += difficulty === "hard" ? 75 : 55;
      }

      // Endgame bonus - ENHANCED in hard mode
      if (aiHand.length <= 3 && colorCounts[color] >= 2) {
        score += difficulty === "hard" ? 120 : 80;
      }

      // Punish desperate players
      if (playerHand.length > aiHand.length + 4 && colorCounts[color] >= 3) {
        score += difficulty === "hard" ? 80 : 50;
      }

      // Performance-based adjustments
      const winRate =
        aiMemory.current.wins / Math.max(1, aiMemory.current.totalGames);
      if (winRate > 0.65) {
        if (colorCounts[color] >= 2) {
          score += difficulty === "hard" ? 50 : 30;
        }
      } else if (winRate < 0.35) {
        if (aiMemory.current.playerColors[color] < 3) {
          score +=
            difficulty === "hard"
              ? 65 * aiMemory.current.adaptationRate
              : 45 * aiMemory.current.adaptationRate;
        }
      }

      // Color preference avoidance - ENHANCED
      const playerColorPref = aiMemory.current.colorPreferences[color] || 0;
      if (playerColorPref > 3) {
        score -= difficulty === "hard" ? 50 : 30;
      }

      // HARD MODE: Predictive color selection
      if (difficulty === "hard" && aiMemory.current.turnsPlayed > 8) {
        // Look at player's last 3 colors played
        const lastThreeColors = aiMemory.current.recentMoves
          .slice(-3)
          .map((m) => m.card.color)
          .filter((c) => COLORS.includes(c));

        // If player avoided a color recently, they probably don't have it
        const availableColors = COLORS.filter(
          (c) => !lastThreeColors.includes(c)
        );

        if (availableColors.includes(color)) {
          score += 70; // They probably can't play this!
        }
      }

      score *=
        1 +
        aiMemory.current.confidenceLevel *
          (difficulty === "hard" ? 0.35 : 0.25);

      return { color, score };
    }).sort((a, b) => b.score - a.score);

    // Hard mode: Pick absolute best 90% of time
    if (difficulty === "hard") {
      if (Math.random() < 0.9 || scoredColors.length === 1) {
        return scoredColors[0].color;
      } else if (scoredColors.length >= 2) {
        return scoredColors[1].color;
      }
    }

    // Occasional unpredictability for medium
    if (
      difficulty === "medium" &&
      Math.random() < 0.2 &&
      scoredColors.length >= 2
    ) {
      return scoredColors[1].color;
    }

    return scoredColors[0].color;
  };

  const handlePlayerDraw = () => {
    if (currentPlayer !== "player" || gameOver || choosingColor || isProcessing)
      return;

    if (drawPending > 0) {
      drawCards("player", drawPending);
      setDrawPending(0);
      setMessage(`Drew ${drawPending} cards`);
      setDrewCard(true);
      setTimeout(() => switchPlayer(), 800);
    } else {
      const topCard = discardPile[discardPile.length - 1];
      const playable = getPlayableCards(playerHand, topCard);

      if (playable.length > 0) {
        aiMemory.current.bluffDetection += 0.15;
        aiMemory.current.defensivePlayCount++;
        aiMemory.current.riskTolerance = Math.max(
          0,
          aiMemory.current.riskTolerance - 0.07
        );
      }

      aiMemory.current.drawFrequency++;
      drawCards("player", 1);
      setDrewCard(true);
      setMessage("Card drawn");
    }
  };

  const handleEndTurn = () => {
    if (
      currentPlayer !== "player" ||
      gameOver ||
      choosingColor ||
      !drewCard ||
      isProcessing
    )
      return;
    switchPlayer();
  };

  const handleUnoCall = () => {
    if (playerHand.length === 2 && !unoState.player) {
      setUnoState((prev) => ({ ...prev, player: true }));
      setMessage("UNO!");
      playSound("uno");
      aiMemory.current.unoCallReliability = Math.min(
        1.0,
        aiMemory.current.unoCallReliability + 0.15
      );
    }
  };

  const handleColorChoice = (color) => {
    if (!choosingColor) return;

    playSound("cardPlay");
    const lastCard = discardPile[discardPile.length - 1];
    const updatedCard = { ...lastCard, color };
    setDiscardPile((prev) => [...prev.slice(0, -1), updatedCard]);
    setChoosingColor(false);

    setTimeout(() => {
      switchPlayer();
    }, 200);
  };

  const topCard =
    discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
  const playableCards = topCard ? getPlayableCards(playerHand, topCard) : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="w-full h-full animate-pulse"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 50%, rgba(0, 255, 255, 0.1) 0%, transparent 50%),
                           radial-gradient(circle at 80% 50%, rgba(255, 0, 255, 0.1) 0%, transparent 50%)`,
          }}
        />
      </div>

      {/* Grid pattern */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `linear-gradient(rgba(0,255,255,0.2) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(0,255,255,0.2) 1px, transparent 1px)`,
            backgroundSize: "100px 100px",
          }}
        />
      </div>

      <style jsx>{`
        @keyframes flyToDiscard {
          0% {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
          50% {
            transform: scale(1.2) translateY(-50px);
            opacity: 0.8;
          }
          100% {
            transform: scale(0.9) translateY(0);
            opacity: 1;
          }
        }
      `}</style>

      <div className="relative z-10 p-3 sm:p-6 md:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4 mb-4 sm:mb-8">
            <div className="border-2 sm:border-4 border-cyan-400 bg-black/80 px-4 sm:px-6 py-2 sm:py-3 rounded-lg shadow-[0_0_20px_rgba(0,255,255,0.5)]">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-cyan-400 tracking-wider">
                UNO <span className="text-pink-400">ELITE</span>
              </h1>
            </div>

            <div className="flex gap-2 sm:gap-4 items-center">
              <div className="border-2 sm:border-4 border-blue-500 bg-black/80 px-3 sm:px-4 py-1 sm:py-2 rounded-lg">
                <span className="text-blue-400 text-xs sm:text-sm font-bold">
                  YOU: {playerWins}
                </span>
              </div>
              <div className="border-2 sm:border-4 border-red-500 bg-black/80 px-3 sm:px-4 py-1 sm:py-2 rounded-lg">
                <span className="text-red-400 text-xs sm:text-sm font-bold">
                  AI: {aiWins}
                </span>
              </div>

              <button
                onClick={() => setShowMenu(!showMenu)}
                className="px-3 sm:px-4 py-1 sm:py-2 border-2 sm:border-4 bg-gray-800 border-gray-600 text-gray-400 text-base sm:text-lg hover:bg-gray-700 rounded-lg hover:border-cyan-400 transition-all"
              >
                ☰
              </button>
            </div>
          </div>

          {showMenu && (
            <div className="border-2 sm:border-4 border-cyan-400 bg-black/90 p-4 sm:p-6 mb-4 sm:mb-6 rounded-lg backdrop-blur-sm">
              <div className="mb-4">
                <div className="text-cyan-400 text-xs sm:text-sm mb-3 font-bold">
                  DIFFICULTY:
                </div>
                <div className="flex gap-2 sm:gap-3">
                  {["easy", "medium", "hard"].map((level) => (
                    <button
                      key={level}
                      onClick={() => setDifficulty(level)}
                      className={`px-3 sm:px-4 py-1 sm:py-2 border-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${
                        difficulty === level
                          ? "bg-gradient-to-r from-purple-600 to-pink-600 border-pink-400 text-white shadow-[0_0_15px_rgba(236,72,153,0.5)]"
                          : "bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400"
                      }`}
                    >
                      {level.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-2 border-yellow-400 bg-black/80 p-3 sm:p-4 mb-3 rounded-lg">
                <div className="text-yellow-400 text-xs sm:text-sm mb-3 font-bold">
                  🧠 AI LEARNING STATS:
                </div>
                <div className="text-green-400 text-[10px] sm:text-xs space-y-2">
                  <div className="flex justify-between">
                    <span>CONFIDENCE:</span>
                    <span className="text-cyan-400 font-bold">
                      {Math.round(aiMemory.current.confidenceLevel * 100)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>GAMES PLAYED:</span>
                    <span className="text-cyan-400 font-bold">
                      {aiMemory.current.totalGames}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>WIN RATE:</span>
                    <span className="text-cyan-400 font-bold">
                      {aiMemory.current.totalGames > 0
                        ? Math.round(
                            (aiMemory.current.wins /
                              aiMemory.current.totalGames) *
                              100
                          )
                        : 0}
                      %
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>ADAPTATION:</span>
                    <span className="text-cyan-400 font-bold">
                      {Math.round(aiMemory.current.adaptationRate * 100)}%
                    </span>
                  </div>
                  <div className="text-pink-400 mt-3 mb-1 font-bold">
                    📊 LEARNED PATTERNS:
                  </div>
                  <div className="flex justify-between">
                    <span>YOUR AGGRESSION:</span>
                    <span className="text-yellow-400 font-bold">
                      {Math.round(aiMemory.current.aggressiveness * 100)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>YOUR RISK STYLE:</span>
                    <span className="text-yellow-400 font-bold">
                      {Math.round(aiMemory.current.riskTolerance * 100)}%
                    </span>
                  </div>
                  {aiMemory.current.turnsPlayed > 5 && (
                    <div className="flex justify-between text-pink-400 mt-2">
                      <span>WEAK COLOR:</span>
                      <span className="font-bold">
                        {Object.entries(aiMemory.current.playerColors)
                          .sort((a, b) => a[1] - b[1])[0][0]
                          .toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={startNewGame}
                className="px-4 sm:px-6 py-2 sm:py-3 border-2 bg-gradient-to-r from-green-600 to-emerald-600 border-green-400 text-white text-xs sm:text-sm font-bold w-full rounded-lg hover:shadow-[0_0_20px_rgba(74,222,128,0.5)] transition-all"
              >
                🎮 NEW GAME
              </button>
            </div>
          )}

          <div className="mb-4 sm:mb-6">
            <div className="flex items-center justify-center gap-2 sm:gap-3 mb-2 sm:mb-3 flex-wrap">
              <div className="border border-red-500 sm:border-2 bg-black/80 px-2 sm:px-4 py-1 sm:py-2 rounded-lg">
                <span className="text-red-400 text-xs sm:text-sm font-bold">
                  🤖 AI ({difficulty.toUpperCase()}) [{aiHand.length}]
                </span>
              </div>
              {unoState.ai && aiHand.length <= 2 && (
                <div className="border border-yellow-400 sm:border-2 bg-yellow-600 px-2 sm:px-3 py-1 text-black text-xs sm:text-sm font-black rounded-lg animate-pulse shadow-[0_0_15px_rgba(250,204,21,0.6)]">
                  🎯 UNO!
                </div>
              )}
              {learningFlash && (
                <div className="border border-cyan-400 sm:border-2 bg-cyan-600 px-2 sm:px-3 py-1 text-black text-xs sm:text-sm font-bold rounded-lg animate-pulse">
                  🧠 LEARNING...
                </div>
              )}
            </div>
            <div className="flex justify-center gap-0.5 sm:gap-1 flex-wrap max-w-full px-2">
              {aiHand.map((card, idx) => {
                const difficultyColors = {
                  easy: "from-green-900 to-green-800 border-green-700",
                  medium: "from-yellow-900 to-yellow-800 border-yellow-700",
                  hard: "from-red-900 to-red-800 border-red-700",
                };

                return (
                  <div
                    key={card.id}
                    className={`relative w-12 h-16 sm:w-14 sm:h-20 md:w-16 md:h-24 bg-gradient-to-br ${difficultyColors[difficulty]} border border-gray-700 sm:border-2 rounded-lg shadow-xl transition-all hover:scale-105 hover:-translate-y-2 overflow-hidden`}
                    style={{
                      transform: `rotate(${
                        (idx - aiHand.length / 2) * 1.5
                      }deg) translateY(${idx % 2 === 0 ? "0" : "3px"})`,
                      boxShadow: "0 6px 15px rgba(0,0,0,0.6)",
                      zIndex: aiHand.length - idx,
                    }}
                  >
                    {/* Card back pattern */}
                    <div className="absolute inset-0 opacity-20">
                      <div className="absolute inset-2 border-2 border-white rounded-lg"></div>
                      <div className="absolute inset-3 border-2 border-white rounded-lg"></div>
                    </div>

                    {/* UNO logo */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div
                          className="text-white text-xl sm:text-2xl md:text-3xl font-black opacity-80"
                          style={{
                            textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
                          }}
                        >
                          UNO
                        </div>
                      </div>
                    </div>

                    {/* Card number indicator for first few cards */}
                    {idx < 3 && (
                      <div className="absolute top-1 right-1 text-[10px] sm:text-xs font-bold text-white/60">
                        {idx + 1}
                      </div>
                    )}

                    {/* Shine effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent rounded-lg pointer-events-none" />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-2 sm:border-4 border-green-600 bg-gradient-to-br from-green-900/80 to-emerald-900/80 p-4 sm:p-6 md:p-8 mb-4 sm:mb-6 rounded-xl backdrop-blur-sm shadow-2xl">
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-8">
              <div className="text-center">
                <div
                  onClick={handlePlayerDraw}
                  className={`w-20 h-28 sm:w-24 sm:h-32 md:w-28 md:h-40 bg-gradient-to-br from-gray-900 to-black border-2 sm:border-4 border-gray-600 rounded-xl flex flex-col items-center justify-center transition-all ${
                    currentPlayer === "player" &&
                    !gameOver &&
                    !choosingColor &&
                    !isProcessing
                      ? "cursor-pointer hover:border-yellow-400 hover:scale-110 hover:shadow-[0_0_30px_rgba(250,204,21,0.5)]"
                      : "opacity-40 cursor-not-allowed"
                  }`}
                  style={{
                    boxShadow:
                      "0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
                  }}
                >
                  <span className="text-3xl sm:text-4xl md:text-5xl mb-2 text-gray-500">
                    🃏
                  </span>
                  <span className="text-xs sm:text-sm text-cyan-400 font-bold">
                    {deck.length}
                  </span>
                </div>
              </div>

              <div className="text-center">
                {topCard && <Card card={topCard} disabled index={0} />}
              </div>

              <div className="flex flex-col items-center">
                <div
                  className={`w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 border-2 sm:border-4 rounded-full flex items-center justify-center text-2xl sm:text-3xl shadow-lg transition-all ${
                    currentPlayer === "player"
                      ? "bg-gradient-to-br from-blue-600 to-cyan-600 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.6)]"
                      : "bg-gradient-to-br from-red-600 to-pink-600 border-pink-400 shadow-[0_0_20px_rgba(236,72,153,0.6)]"
                  }`}
                >
                  {currentPlayer === "player" ? "👤" : "🤖"}
                </div>
              </div>
            </div>

            <div className="mt-4 sm:mt-6">
              <div className="border border-yellow-400 sm:border-2 bg-black/80 py-2 sm:py-3 px-3 sm:px-4 text-center rounded-lg">
                <p className="text-cyan-400 text-xs sm:text-sm font-bold">
                  {message}
                </p>
              </div>
            </div>

            {choosingColor && (
              <div className="mt-4 sm:mt-6 flex justify-center gap-2 sm:gap-4">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleColorChoice(color)}
                    className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 ${colorStyles[color]} border-2 sm:border-4 border-white rounded-lg hover:scale-125 transition-all shadow-lg hover:shadow-2xl`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="mb-4 sm:mb-6">
            <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-4 flex-wrap">
              <div className="border border-blue-500 sm:border-2 bg-black/80 px-2 sm:px-4 py-1 sm:py-2 rounded-lg">
                <span className="text-blue-400 text-xs sm:text-sm font-bold">
                  👤 YOU [{playerHand.length}]
                </span>
              </div>
              {playerHand.length === 2 && !unoState.player && (
                <button
                  onClick={handleUnoCall}
                  className="px-3 sm:px-4 py-1 sm:py-2 border border-yellow-300 sm:border-2 bg-yellow-500 text-black text-xs sm:text-sm font-black hover:scale-110 rounded-lg shadow-lg hover:shadow-[0_0_20px_rgba(250,204,21,0.6)] transition-all"
                >
                  🔔 CALL UNO!
                </button>
              )}
              {unoState.player && playerHand.length <= 2 && (
                <div className="border border-yellow-400 sm:border-2 bg-yellow-600 px-2 sm:px-3 py-1 text-black text-xs sm:text-sm font-black rounded-lg animate-pulse">
                  UNO!
                </div>
              )}
            </div>

            <div className="flex justify-center gap-1 sm:gap-2 md:gap-3 flex-wrap min-h-[120px] sm:min-h-[150px] items-end px-2">
              {playerHand.map((card, index) => {
                const isPlayable = topCard && canPlayCard(card, topCard);
                const canPlay =
                  currentPlayer === "player" &&
                  !gameOver &&
                  !choosingColor &&
                  !isProcessing;

                // Allow stacking
                const canStack =
                  drawPending > 0 &&
                  (card.value === "draw2" || card.value === "wild4");

                const canActuallyPlay =
                  canPlay && (drawPending === 0 || canStack) && isPlayable;

                return (
                  <div key={card.id} className="relative">
                    <Card
                      card={card}
                      onClick={() =>
                        canActuallyPlay && playCard(card, "player")
                      }
                      disabled={!canActuallyPlay}
                      highlight={canActuallyPlay}
                      index={index}
                      isAnimating={card.id === animatingCardId}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-center gap-2 sm:gap-3">
            {drewCard && currentPlayer === "player" && !isProcessing && (
              <button
                onClick={handleEndTurn}
                className="px-4 sm:px-6 md:px-8 py-2 sm:py-3 border border-orange-400 sm:border-2 bg-gradient-to-r from-orange-600 to-red-600 text-white text-xs sm:text-sm font-bold hover:scale-105 rounded-lg shadow-lg hover:shadow-[0_0_20px_rgba(251,146,60,0.6)] transition-all"
              >
                ⏭️ END TURN
              </button>
            )}
          </div>

          {gameOver && (
            <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 backdrop-blur-md p-4">
              <div className="border-2 sm:border-4 border-yellow-400 bg-gradient-to-br from-gray-900 to-black p-6 sm:p-8 md:p-10 text-center max-w-md w-full rounded-2xl shadow-[0_0_50px_rgba(250,204,21,0.5)]">
                <div className="text-3xl sm:text-4xl md:text-5xl font-black mb-4 sm:mb-6">
                  {winner === "player" ? (
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 animate-pulse">
                      🎉 YOU WIN! 🎉
                    </span>
                  ) : (
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-pink-500">
                      🤖 AI WINS
                    </span>
                  )}
                </div>
                <div className="border border-cyan-400 sm:border-2 bg-black/80 p-4 sm:p-6 mb-4 sm:mb-6 text-base sm:text-lg rounded-lg">
                  <p className="text-cyan-400 font-bold">YOU: {playerWins}</p>
                  <p className="text-pink-400 font-bold">AI: {aiWins}</p>
                </div>
                <button
                  onClick={startNewGame}
                  className="px-6 sm:px-8 py-3 sm:py-4 border border-green-400 sm:border-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm sm:text-base font-bold hover:scale-110 rounded-lg shadow-lg hover:shadow-[0_0_30px_rgba(74,222,128,0.6)] transition-all"
                >
                  🎮 PLAY AGAIN
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
