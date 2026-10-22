import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegistrar } from "@/components/iptv/sw-registrar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BDIX TV — Live TV Player",
  description:
    "Watch 350+ live TV channels from the Mrgify BDIX IPTV playlist. Working-status checks, instant channel zapping, and automatic daily playlist updates.",
  applicationName: "BDIX TV",
  keywords: ["BDIX", "IPTV", "live TV", "Bangladesh", "M3U", "Mrgify", "streaming"],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "BDIX TV — Live TV Player",
    description: "350+ live channels from the Mrgify BDIX IPTV playlist, with status checks and instant zapping.",
    siteName: "BDIX TV",
    type: "website",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <Toaster />
          <ServiceWorkerRegistrar />
        </Providers>
      </body>
    </html>
  );
}
