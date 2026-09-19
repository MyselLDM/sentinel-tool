import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type SectionProps = {
  id?: string;
  className?: string;
  children: ReactNode;
};

/**
 * A landing-page section: a solid panel on the hatched base, separated from its
 * neighbours by the parent's gap. Plain markup — no entrance animation.
 */
export function Section({ id, className, children }: SectionProps) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-24 border border-line bg-paper", className)}
    >
      {children}
    </section>
  );
}
