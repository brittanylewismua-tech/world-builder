import type { Metadata } from "next";
import { WorldProvider } from "@/lib/useWorld";
import Boundary from "@/components/Boundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "World Builder",
  description:
    "Build around one customer world instead of jumping between unrelated niches.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,600;1,700;1,800&family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <Boundary>
          <WorldProvider>{children}</WorldProvider>
        </Boundary>
      </body>
    </html>
  );
}
