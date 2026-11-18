import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import Nav from "@/components/Nav";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lighnib, Small Lightning payments, locked.",
  description: "Your wallet is the key. Lighnib it.",
  manifest: "/manifest.json",
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
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
