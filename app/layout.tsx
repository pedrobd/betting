import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Betano Engine | Análise Quantitativa de Apostas",
  description:
    "Motor de análise de apostas com gestão de banca integrada — Kelly Criterion, Dutching e estratégias live.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
