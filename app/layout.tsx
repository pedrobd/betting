import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "COOLBET Analytics | Elite Betting Intelligence",
  description:
    "Inteligência quantitativa para apostas desportivas com gestão de banca profissional e estratégias de alta precisão.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
