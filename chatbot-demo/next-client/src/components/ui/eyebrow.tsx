import type { ReactNode } from "react";

/** Small uppercase section label with a leading tick. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="label-mono flex items-center gap-2">
      <span aria-hidden className="block h-1.5 w-1.5 bg-ink" />
      {children}
    </p>
  );
}
