import type { Metadata } from "next";
import { Rajdhani, Chakra_Petch, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

const display = Rajdhani({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});
const ui = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
});
const mono = Share_Tech_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "CAL.EXE // Night City",
  description: "Full-page cyberpunk calendar",
};

const RootLayout = ({ children }: { children: React.ReactNode }) => (
  <html
    lang="en"
    className={`${display.variable} ${ui.variable} ${mono.variable}`}
  >
    <body>{children}</body>
  </html>
);

export default RootLayout;
