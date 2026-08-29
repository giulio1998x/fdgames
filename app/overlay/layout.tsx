import type { ReactNode } from "react";

export const metadata = {
  title: "Overlay",
};

/**
 * Marker wrapper for the OBS Browser Source views. The `overlay-root` class is
 * what globals.css keys off to strip the page background back to transparent.
 */
export default function OverlayLayout({ children }: { children: ReactNode }) {
  return <div className="overlay-root">{children}</div>;
}
