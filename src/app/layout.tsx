import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "Analyze page metadata, headings, links, images, Open Graph tags, and technical SEO checks. Research keywords and audit entire sites for SEO issues.";

export const metadata: Metadata = {
  title: "SEO+ — SEO Analysis Suite — anit.guru",
  description,
  metadataBase: new URL("https://seo.anit.guru"),
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon", type: "image/png", sizes: "32x32" },
    ],
    apple: { url: "/icon", type: "image/png", sizes: "32x32" },
  },
  openGraph: {
    title: "SEO+ — SEO Analysis Suite — anit.guru",
    description,
    url: "https://seo.anit.guru",
    siteName: "An IT Guru",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SEO+ — SEO Analysis Suite — anit.guru",
    description,
  },
  alternates: {
    canonical: "https://seo.anit.guru",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Script
          defer
          src="https://anit.guru/t.js"
          data-site="seo.anit.guru"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
