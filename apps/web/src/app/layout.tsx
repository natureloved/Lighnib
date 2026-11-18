import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ThemeProvider } from "next-themes";
import Nav from "@/components/Nav";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://lighnib.vercel.app"),
  title: "Lighnib, Small Lightning payments, locked.",
  description: "Your wallet is the key. Lighnib it.",
  manifest: "/manifest.json",
  openGraph: {
    title: "Lighnib, Small Lightning payments, locked.",
    description: "Your wallet is the key. Lighnib it.",
    url: "https://lighnib.vercel.app",
    siteName: "Lighnib",
    images: [
      {
        url: "/og-banner.png",
        width: 1200,
        height: 630,
        alt: "Lighnib, small Lightning payments, locked.",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lighnib, Small Lightning payments, locked.",
    description: "Your wallet is the key. Lighnib it.",
    images: ["/og-banner.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0B1F14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/fonts/bricolagegrotesque-latin-800-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/bricolagegrotesque-latin-700-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <main>{children}</main>
          <Nav />
          <footer className="site-footer">
            <Link
              href="https://github.com/natureloved/Lighnib"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </Link>
          </footer>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
