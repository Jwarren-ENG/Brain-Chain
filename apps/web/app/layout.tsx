import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Company Brain — Shared intelligence for every team",
  description:
    "A living, permission-aware company brain that turns knowledge, meetings, feedback, and work into better decisions.",
};

const themeScript = `
try {
  const t = localStorage.getItem("brainchain_theme") || "dark";
  document.documentElement.classList.toggle("dark", t === "dark");
} catch (e) { document.documentElement.classList.add("dark"); }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}
        style={
          {
            "--font-geist-sans": GeistSans.style.fontFamily,
            "--font-geist-mono": GeistMono.style.fontFamily,
          } as React.CSSProperties
        }
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
