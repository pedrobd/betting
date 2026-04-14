import './globals.css';

export const metadata = {
  title: '👑 Bet Analyzer Top 10',
  description: 'O teu analisador diário de odds favoritas.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt">
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
