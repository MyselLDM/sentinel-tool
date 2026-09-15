import type { Metadata } from "next";
import { Geist_Mono, Instrument_Serif, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Titles — elegant high-contrast serif.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

// Body — clean, geometric sans.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

// Labels, code and metadata.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sentinel — alignment verification for agent subtasks",
  description:
    "Sentinel verifies each subtask an agent proposes against its authorized goal using two independent models, and returns a single auditable decision.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${spaceGrotesk.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper text-ink">
        {children}
      </body>
    </html>
  );
}
