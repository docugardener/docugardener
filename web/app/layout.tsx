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
  description: "Automated Documentation Drift Detection",
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
