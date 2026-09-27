import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type SectionProps = {
  id?: string;
  className?: string;
  children: ReactNode;
};

/**
 * A content panel with the standard card appearance — rounded corners,
 * subtle border, white background. Used on landing page and console pages.
 */
export function Section({ id, className, children }: SectionProps) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-24 rounded-xl border border-border bg-surface", className)}
    >
      {children}
    </section>
  );
}
