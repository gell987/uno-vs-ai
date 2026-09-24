import { memo, useId, type CSSProperties } from "react";
import { DECK, type Card, type CardColor, type CardId, type Color } from "@/lib/uno";

export const CARD_HEX: Record<CardColor, string> = {
  red: "#e8352e",
  yellow: "#f7c51e",
  green: "#2daa55",
  blue: "#1c6fd1",
  wild: "#17171b",
};

const INK = "#141417";
const PAPER = "#fbfbf8";
const DISPLAY: CSSProperties = { fontFamily: "var(--font-display)" };
const OVAL = { cx: 60, cy: 90, rx: 41, ry: 68, transform: "rotate(28 60 90)" };

/** Shape per color so cards stay distinguishable without color vision. */
export function ColorShape({ color, x, y, size }: { color: Color; x: number; y: number; size: number }) {
  const s = size;
  const common = { fill: "#fff", stroke: INK, strokeWidth: s * 0.14 };
  switch (color) {
    case "red":
      return <path d={`M${x} ${y - s / 2} L${x + s / 2} ${y + s / 2} L${x - s / 2} ${y + s / 2} Z`} {...common} />;
    case "yellow":
      return <circle cx={x} cy={y} r={s / 2} {...common} />;
    case "green":
      return <rect x={x - s / 2} y={y - s / 2} width={s} height={s} {...common} />;
    case "blue":
      return <path d={`M${x} ${y - s / 1.6} L${x + s / 1.8} ${y} L${x} ${y + s / 1.6} L${x - s / 1.8} ${y} Z`} {...common} />;
  }
}

function SkipGlyph({ fill, scale = 1 }: { fill: string; scale?: number }) {
  return (
    <g transform={`scale(${scale})`}>
      <circle r="24" fill="none" stroke={INK} strokeWidth="16" />
      <line x1="-16" y1="16" x2="16" y2="-16" stroke={INK} strokeWidth="16" />
      <circle r="24" fill="none" stroke={fill} strokeWidth="9" />
      <line x1="-16" y1="16" x2="16" y2="-16" stroke={fill} strokeWidth="9" />
    </g>
  );
}

const ARROW = "M -7 24 L -7 -4 L -16 -4 L 0 -25 L 16 -4 L 7 -4 L 7 24 Z";

function ReverseGlyph({ fill, scale = 1 }: { fill: string; scale?: number }) {
  return (
    <g transform={`scale(${scale}) rotate(45)`}>
      <path d={ARROW} transform="translate(-11 -4)" fill={fill} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
      <path d={ARROW} transform="translate(11 4) rotate(180)" fill={fill} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
    </g>
  );
}

function MiniCards({ fills, scale = 1 }: { fills: string[]; scale?: number }) {
  const n = fills.length;
  return (
    <g transform={`scale(${scale})`}>
      {fills.map((f, i) => {
        const offset = (i - (n - 1) / 2) * (n > 2 ? 11 : 16);
        const rot = n > 2 ? (i - (n - 1) / 2) * 14 : -8;
        return (
          <g key={i} transform={`translate(${offset} ${n > 2 ? Math.abs(i - (n - 1) / 2) * 5 : offset * 0.9}) rotate(${rot})`}>
            <rect x="-15" y="-22" width="30" height="44" rx="5" fill={INK} />
            <rect x="-12.5" y="-19.5" width="25" height="39" rx="3.5" fill={f} stroke="#fff" strokeWidth="2.5" />
          </g>
        );
      })}
    </g>
  );
}

function WildOval({ clipId, scale = 1 }: { clipId: string; scale?: number }) {
  return (
    <g transform={`translate(60 90) scale(${scale}) translate(-60 -90)`}>
      <defs>
        <clipPath id={clipId}>
          <ellipse {...OVAL} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width="60" height="90" fill={CARD_HEX.red} />
        <rect x="60" y="0" width="60" height="90" fill={CARD_HEX.blue} />
        <rect x="0" y="90" width="60" height="90" fill={CARD_HEX.yellow} />
        <rect x="60" y="90" width="60" height="90" fill={CARD_HEX.green} />
      </g>
      <ellipse {...OVAL} fill="none" stroke="#fff" strokeWidth="4" />
    </g>
  );
}

function Numeral({ text, fill, size, x, y, shadow = true, stroke = 3.4 }: { text: string; fill: string; size: number; x: number; y: number; shadow?: boolean; stroke?: number }) {
  const common = { x, y, textAnchor: "middle" as const, dominantBaseline: "central" as const, fontSize: size, style: DISPLAY };
  return (
    <>
      {shadow && (
        <text {...common} x={x + size * 0.045} y={y + size * 0.05} fill={INK}>
          {text}
        </text>
      )}
      <text {...common} fill={fill} stroke={INK} strokeWidth={stroke} paintOrder="stroke" strokeLinejoin="round">
        {text}
      </text>
    </>
  );
}

function Corner({ card, x, y, rotate, clipId }: { card: Card; x: number; y: number; rotate?: boolean; clipId: string }) {
  const transform = rotate ? `rotate(180 ${x} ${y})` : undefined;
  let body: React.ReactNode;
  switch (card.rank) {
    case "skip":
      body = (
        <g transform={`translate(${x} ${y})`}>
          <SkipGlyph fill="#fff" scale={0.34} />
        </g>
      );
      break;
    case "reverse":
      body = (
        <g transform={`translate(${x} ${y})`}>
          <ReverseGlyph fill="#fff" scale={0.34} />
        </g>
      );
      break;
    case "wild":
      body = (
        <g transform={`translate(${x - 60} ${y - 90})`}>
          <WildOval clipId={clipId} scale={0.2} />
        </g>
      );
      break;
    default: {
      const label = card.rank === "draw2" ? "+2" : card.rank === "wild4" ? "+4" : card.rank;
      body = <Numeral text={label} fill="#fff" size={card.rank.length > 1 ? 21 : 25} x={x} y={y} shadow={false} stroke={2.6} />;
    }
  }
  return <g transform={transform}>{body}</g>;
}

function CardFaceSvg({ card, colorblind }: { card: Card; colorblind: boolean }) {
  const uid = useId().replace(/:/g, "");
  const fill = CARD_HEX[card.color];
  const isWild = card.color === "wild";
  let center: React.ReactNode;
  switch (card.rank) {
    case "skip":
      center = (
        <g transform="translate(60 90)">
          <SkipGlyph fill={fill} />
        </g>
      );
      break;
    case "reverse":
      center = (
        <g transform="translate(60 90)">
          <ReverseGlyph fill={fill} />
        </g>
      );
      break;
    case "draw2":
      center = (
        <g transform="translate(60 92)">
          <MiniCards fills={[fill, fill]} />
        </g>
      );
      break;
    case "wild":
      center = <WildOval clipId={`${uid}c`} />;
      break;
    case "wild4":
      center = (
        <>
          <ellipse {...OVAL} fill="#fff" />
          <g transform="translate(60 94)">
            <MiniCards fills={[CARD_HEX.blue, CARD_HEX.green, CARD_HEX.red, CARD_HEX.yellow]} scale={0.95} />
          </g>
        </>
      );
      break;
    default:
      center = (
        <>
          <Numeral text={card.rank} fill={fill} size={82} x={60} y={92} />
          {(card.rank === "6" || card.rank === "9") && (
            <rect x="46" y="124" width="28" height="6" rx="3" fill={fill} stroke={INK} strokeWidth="2.4" paintOrder="stroke" />
          )}
        </>
      );
  }
  return (
    <svg viewBox="0 0 120 180" className="block h-full w-full" aria-hidden="true" focusable="false">
      <rect width="120" height="180" rx="13" fill={PAPER} />
      <rect x="6" y="6" width="108" height="168" rx="9" fill={fill} />
      {!isWild && <ellipse {...OVAL} fill="#fff" />}
      {center}
      <Corner card={card} x={20} y={27} clipId={`${uid}a`} />
      <Corner card={card} x={100} y={153} rotate clipId={`${uid}b`} />
      {colorblind && !isWild && (
        <>
          <ColorShape color={card.color as Color} x={20} y={52} size={11} />
          <ColorShape color={card.color as Color} x={100} y={128} size={11} />
        </>
      )}
    </svg>
  );
}

function CardBackSvg() {
  return (
    <svg viewBox="0 0 120 180" className="block h-full w-full" aria-hidden="true" focusable="false">
      <rect width="120" height="180" rx="13" fill={PAPER} />
      <rect x="6" y="6" width="108" height="168" rx="9" fill={CARD_HEX.wild} />
      <ellipse {...OVAL} fill={CARD_HEX.red} />
      <g transform="rotate(-24 60 90)">
        <text
          x="60"
          y="90"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="40"
          fill={CARD_HEX.yellow}
          stroke={INK}
          strokeWidth="5"
          paintOrder="stroke"
          strokeLinejoin="round"
          style={DISPLAY}
        >
          UNO
        </text>
      </g>
    </svg>
  );
}

export interface PlayingCardProps {
  cardId?: CardId | null;
  faceDown?: boolean;
  colorblind?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** A single card, face up or down. Purely presentational; size it with width. */
export const PlayingCard = memo(function PlayingCard({ cardId, faceDown, colorblind = false, className = "", style }: PlayingCardProps) {
  const card = cardId === null || cardId === undefined ? null : DECK[cardId];
  return (
    <div
      className={`relative aspect-[2/3] select-none rounded-[10.8%/7.2%] shadow-[0_2px_3px_rgb(0_0_0/0.25),0_8px_18px_rgb(0_0_0/0.28)] ${className}`}
      style={style}
    >
      {faceDown || !card ? <CardBackSvg /> : <CardFaceSvg card={card} colorblind={colorblind} />}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/25 via-transparent to-black/10 mix-blend-soft-light" />
    </div>
  );
});
