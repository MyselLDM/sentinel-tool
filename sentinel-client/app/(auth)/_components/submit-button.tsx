"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Submit button that reflects the enclosing form's pending state via
 * `useFormStatus` (must be rendered inside the `<form>`).
 */
export function SubmitButton({
  children,
  pendingLabel = "Working…",
}: {
  children: ReactNode;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="btn btn-primary btn-block"
      disabled={pending}
      aria-busy={pending}
    >
      {pending && <span className="loading loading-spinner loading-xs" aria-hidden />}
      {pending ? pendingLabel : children}
    </button>
  );
}
