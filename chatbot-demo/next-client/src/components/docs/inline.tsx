import type { ReactNode } from "react";

/**
 * Minimal inline formatting for the docs strings: `` `code` `` → monospace and
 * `**bold**` → emphasised. Everything else renders as plain text (no HTML), so
 * there is nothing to sanitise.
 */
export function Inline({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    if (match[1] !== undefined) {
      nodes.push(
        <code key={key++} className="font-mono text-[0.9em] text-ink">
          {match[1]}
        </code>,
      );
    } else {
      nodes.push(
        <strong key={key++} className="font-medium text-ink">
          {match[2]}
        </strong>,
      );
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));

  return <>{nodes}</>;
}
