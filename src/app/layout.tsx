import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Blog Automation Studio 3.0', description: 'Private local publishing dashboard' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
