import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SITE } from "@/lib/content";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: SITE.title,
  description: SITE.description,
};

export const viewport: Viewport = {
  themeColor: "#050b17",
  // The mountain climb has its own custom pinch-to-zoom and drag gestures
  // (CameraRig.tsx's zoom/look-around, each station's own object drag) —
  // without `userScalable: false`, a visitor's pinch or double-tap on the
  // canvas can ALSO trigger the browser's native page-zoom, fighting the
  // custom gesture handling and reading as "finicky"/unresponsive touch
  // interaction. This only affects touch pinch/double-tap zoom of the page;
  // it has no effect on desktop mouse/trackpad input at all.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
