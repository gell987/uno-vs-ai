import { ImageResponse } from "next/og";
import { loadGoogleFont } from "./og-font";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const fonts = await loadGoogleFont("Lilita One", "7");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 40% 35%, #2a8f5a 0%, #0a3a23 100%)",
        }}
      >
        <div
          style={{
            width: 104,
            height: 150,
            borderRadius: 14,
            background: "#fbfbf8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: "rotate(-10deg)",
          }}
        >
          <div
            style={{
              width: 92,
              height: 138,
              borderRadius: 10,
              background: "#e8352e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 68,
                height: 112,
                borderRadius: "50%",
                background: "white",
                transform: "rotate(28deg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ transform: "rotate(-28deg)", fontSize: 70, fontFamily: "Lilita One", color: "#e8352e", display: "flex" }}>7</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
