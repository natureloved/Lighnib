import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lighnib — Small Lightning payments, locked.",
  description: "Your wallet is the key. Lighnib it.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0B1F14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
        <nav>
          <Link href="/login">Login</Link>
          <Link href="/pay">Pay</Link>
          <Link href="/wallet">Wallet</Link>
          <Link href="/receipts">Receipts</Link>
          <Link href="/dispute">Dispute</Link>
        </nav>
      </body>
    </html>
  );
}
