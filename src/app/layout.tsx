import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { THEME_SCRIPT } from "@/lib/theme";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bilingual Lyrics",
  description: "Turn worship songs into bilingual ProPresenter slides",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The theme script sets data-theme before React hydrates, so it differs from the server HTML on purpose.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${geistSans.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
