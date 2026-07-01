import type { Metadata } from "next";
import { Inter, EB_Garamond } from "next/font/google";
import Script from "next/script";
import LayoutWrapper from "@/components/LayoutWrapper";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600"],
});
const garamond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://engram1002.vercel.app"),
  title: "Engram: A memory that knows when to update itself",
  description: "A self-organizing personal knowledge graph that ingests everything you read, write, and build, and actively maintains itself.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-16x16.png?v=4", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png?v=4", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico?v=4", sizes: "any" },
    ],
    shortcut: "/favicon.ico?v=4",
    apple: "/apple-touch-icon.png?v=4",
  },
  openGraph: {
    title: "Engram: A memory that knows when to update itself",
    description: "A self-organizing personal knowledge graph built on Cognee's memory lifecycle.",
    url: process.env.NEXT_PUBLIC_APP_URL || "https://engram1002.vercel.app",
    siteName: "Engram",
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "Engram Metadata Graph and memory visualization",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Engram: A memory that knows when to update itself",
    description: "A self-organizing personal knowledge graph built on Cognee's memory lifecycle.",
    images: ["/images/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${garamond.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              var t;
              try { t = localStorage.getItem('theme') } catch(e) {}
              var d = document.documentElement;
              if (t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                d.classList.add('dark');
                d.style.colorScheme = 'dark';
              } else {
                d.classList.add('light');
                d.style.colorScheme = 'light';
              }
            })();
          `
        }} />
      </head>
      <body className="h-full bg-canvas text-ink">
        <LayoutWrapper>{children}</LayoutWrapper>
        <Script id="theme-transition" strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `requestAnimationFrame(()=>document.documentElement.classList.add("theme-transition"))`
          }}
        />
      </body>
    </html>
  );
}
