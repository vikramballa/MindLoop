import type { Metadata, Viewport } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const serif = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "MindLoop",
  description: "A 10-second daily check-in, one small thing that helps, and a garden that grows with you. Not a medical service.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "MindLoop", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f0ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0d12" },
  ],
  viewportFit: "cover",
};

// Applies a saved light/dark choice before first paint so the page never flashes the wrong theme.
const THEME_SCRIPT = `try{var t=localStorage.getItem("ml_theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${serif.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <div aria-hidden className="aura" />
        <div aria-hidden className="grain" />
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
