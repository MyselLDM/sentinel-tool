"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";

// Cubic-bezier ease-out for a calm, decelerating reveal.
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

type SectionProps = {
  id?: string;
  className?: string;
  children: ReactNode;
  /** Stagger delay in seconds. */
  delay?: number;
};

/**
 * A landing-page section: a solid panel (hairline border on the hatched base)
 * that fades and flies up into place, the first time it scrolls into view.
 *
 * Trigger timing — tuned so the reveal does NOT fire while the section is still
 * mostly below the fold:
 *   - `margin: "0px 0px -20% 0px"` shrinks the IntersectionObserver root's
 *     bottom edge by 20% of the viewport height, so the section must travel
 *     roughly a fifth of the screen up before the entrance starts.
 *     (`once` then guarantees it runs at most once per page load.)
 *
 * NOTE: reduced motion is handled by `MotionProvider` (a `MotionConfig` with
 * `reducedMotion="user"`) at the root — deliberately NOT by branching here.
 * `useReducedMotion()` is a client-only value, so branching the rendered output
 * on it makes the server and client emit different `style` attributes and
 * breaks hydration.
 */
export function Section({ id, className, children, delay = 0 }: SectionProps) {
  return (
    <motion.section
      id={id}
      data-reveal
      initial={{ opacity: 0, y: 80 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -20% 0px" }}
      transition={{ duration: 0.7, ease: EASE, delay }}
      className={cn("scroll-mt-24 border border-line bg-paper", className)}
    >
      {children}
    </motion.section>
  );
}
