import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Lilita_One } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const lilita = Lilita_One({ variable: "--font-lilita", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "UNO vs AI",
    template: "%s · UNO vs AI",
  },
  description:
    "Play UNO against AI opponents that count cards, read your hand from your draws, and run thousands of Monte Carlo simulations per move. Official rules, house rules, 2–4 players.",
  applicationName: "UNO vs AI",
  keywords: ["UNO", "card game", "AI", "Monte Carlo", "browser game"],
  openGraph: {
    title: "UNO vs AI",
    description: "Can you beat a card-counting, future-simulating AI at UNO?",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "UNO vs AI",
    description: "Can you beat a card-counting, future-simulating AI at UNO?",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a3a23",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${lilita.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
