import type { Metadata } from "next";
import { WorldProvider } from "@/lib/useWorld";
import Boundary from "@/components/Boundary";
import "./globals.css";

/*
  The tab said "World Builder" with the default Next.js icon, and a link
  pasted anywhere unfurled as nothing at all. The globe is already the mark
  everywhere else in the product; it belongs in the tab too.
*/
export const metadata: Metadata = {
  metadataBase: new URL("https://world-builder-u8x3.vercel.app"),
  title: {
    default: "World Builder",
    template: "%s · World Builder",
  },
  description:
    "Build around one customer world instead of jumping between unrelated niches.",
  /*
    Drawn for the size it is actually seen at.

    The first version was the globe from the wordmark, scaled down. Its lines
    are hairlines — lovely at 200px, and at sixteen they average out into a
    pale pink smudge with no globe in it. A favicon gets about twelve usable
    pixels across, so this is a solid disc with two white lines at nine per
    cent of the width, and nothing else. Legible is the whole brief.
  */
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "32x32" },
      { url: "/mark.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "World Builder",
    description:
      "Build around one customer world instead of jumping between unrelated niches.",
    // The full lockup, not the globe alone — a shared link should say the name.
    images: ["/og.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "World Builder",
    description:
      "Build around one customer world instead of jumping between unrelated niches.",
    images: ["/og.png"],
  },
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
      {/*
        The wallpaper globes sit deliberately outside the viewport, which was
        letting the page scroll a couple of pixels sideways on a phone.
      */}
      <body className="overflow-x-hidden antialiased">
        <Boundary>
          <WorldProvider>{children}</WorldProvider>
        </Boundary>
      </body>
    </html>
  );
}
