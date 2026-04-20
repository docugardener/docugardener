// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "DocuGardener",
  description: "Automated documentation drift detection for AI-native engineering teams. Keep your docs honest as AI writes more of your code.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  openGraph: {
    title: "DocuGardener",
    description: "Keep your docs honest as AI writes more of your code.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DocuGardener",
    description: "Keep your docs honest as AI writes more of your code.",
    images: ["/og-image.png"],
  },
};

import { Providers } from "./providers";
import { ThemeProvider } from "@/lib/theme";
import { CookieBanner } from "@/components/marketing/CookieBanner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          <Providers>
            {children}
            <CookieBanner />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
