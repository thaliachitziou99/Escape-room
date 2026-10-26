import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'ESCAPE 13' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="el">
      <body>{children}</body>
    </html>
  );
}
