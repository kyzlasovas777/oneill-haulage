import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "O'Neill TEST",
  description: "O'Neill Haulage test app",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon.clear.png", sizes: "1024x1024", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
<html
  lang="en"
  className={`${geistSans.variable} ${geistMono.variable} h-full bg-white antialiased`}
>
  <body className="min-h-full flex flex-col bg-white">{children}</body>
</html>
  );
}
