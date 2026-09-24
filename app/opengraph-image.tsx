import { ImageResponse } from "next/og";
import { loadGoogleFont } from "./og-font";

export const alt = "UNO vs AI: play UNO against card-counting, future-simulating AI opponents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CARDS = [
  { color: "#e8352e", label: "7", rotate: -16, x: 10, y: 50 },
  { color: "#1c6fd1", label: "+2", rotate: -2, x: 135, y: 22 },
  { color: "#f7c51e", label: "9", rotate: 12, x: 260, y: 44 },
];
const TITLE = "UNO vs AI";
const TAGLINE = "Opponents that count cards, read your hand, and simulate thousands of futures per move.";

function Card({ color, label, rotate, x, y }: (typeof CARDS)[number]) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 200,
        height: 300,
        borderRadius: 24,
        background: "#fbfbf8",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `rotate(${rotate}deg)`,
        boxShadow: "0 24px 50px rgba(0,0,0,0.45)",
      }}
    >
      <div
        style={{
          width: 178,
          height: 278,
          borderRadius: 16,
          background: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 136,
            height: 228,
            borderRadius: "50%",
            background: "white",
            transform: "rotate(28deg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ transform: "rotate(-28deg)", fontSize: 104, fontFamily: "Lilita One", color, display: "flex" }}>{label}</div>
        </div>
      </div>
    </div>
  );
}

export default async function OpenGraphImage() {
  // The first font is the default: body text in Geist, the title and numerals in Lilita One.
  const fonts = [...(await loadGoogleFont("Geist", TAGLINE, 500)), ...(await loadGoogleFont("Lilita One", TITLE + "792+"))];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 80px",
          background: "radial-gradient(circle at 40% 40%, #2a8f5a 0%, #1f7a4a 35%, #0a3a23 100%)",
          color: "white",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 560 }}>
          <div style={{ display: "flex", fontSize: 118, fontFamily: "Lilita One" }}>
            UNO <span style={{ color: "#fcd34d", marginLeft: 28 }}>vs AI</span>
          </div>
          <div style={{ display: "flex", fontSize: 36, lineHeight: 1.3, color: "rgba(255,255,255,0.85)", marginTop: 18 }}>{TAGLINE}</div>
        </div>
        <div style={{ display: "flex", position: "relative", width: 500, height: 420, marginLeft: 10 }}>
          {CARDS.map((c) => (
            <Card key={c.label} {...c} />
          ))}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
