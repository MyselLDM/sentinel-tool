import type { ReactNode } from "react";

/** Small section label with a subtle accent dot. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary-blue">
      <span aria-hidden className="block h-1.5 w-1.5 rounded-full bg-primary-blue" />
      {children}
    </p>
  );
}
