"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

type ReducedMotionPreference = "always" | "never" | "user";

/**
 * Global Framer Motion defaults.
 *
 * `reducedMotion="user"` makes Framer Motion honour the OS "reduce motion"
 * preference at animation time: transform animations are skipped, opacity still
 * animates. This is intentionally a *runtime* setting rather than a render-time
 * branch — `useReducedMotion()` returns different values on the server (no
 * `window`) and client, so branching on it produces hydration mismatches.
 *
 * `MotionConfig` renders no DOM element, so it does not affect layout.
 */
export function MotionProvider({
  children,
  reducedMotion = "user",
}: {
  children: ReactNode;
  reducedMotion?: ReducedMotionPreference;
}) {
  return <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>;
}
