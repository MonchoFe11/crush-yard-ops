import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Crush Yard Ops",
  description: "Unified Operations Hub for Crush Yard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="bg-(--bg-primary)"
    >
      <body
        className={`${inter.variable} font-sans antialiased min-h-screen bg-(--bg-primary) text-(--text-primary)`}
      >
        {children}
      </body>
    </html>
  );
}