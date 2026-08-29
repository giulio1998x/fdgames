import type { ReactNode } from "react";

import { SoundToggle } from "@/components/SoundToggle";

/**
 * Common frame for every overlay. Deliberately paints no background of its own
 * so the OBS Browser Source stays transparent.
 */
export function OverlayShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 p-6 text-white">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">{title}</h1>
        <SoundToggle />
      </div>
      {children}
      {footer ? <div className="text-xs text-white/70">{footer}</div> : null}
    </div>
  );
}

export function OverlayStatus({ children }: { children: ReactNode }) {
  return (
    <p className="rounded bg-black/70 px-4 py-2 text-sm text-white backdrop-blur-sm">
      {children}
    </p>
  );
}

export function TriggerButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border-2 border-white/70 bg-black/70 px-6 py-3 text-lg font-semibold text-white backdrop-blur-sm transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
