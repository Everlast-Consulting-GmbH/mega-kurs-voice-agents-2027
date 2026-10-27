import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// One sans for everything (design guide); light weights for the big numbers and headlines.
const inter = Inter({ subsets: ["latin"], weight: ["200", "300", "400", "500", "600"], variable: "--font-inter" });

export const metadata: Metadata = { title: "Jarvis", description: "Jarvis HUD" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
