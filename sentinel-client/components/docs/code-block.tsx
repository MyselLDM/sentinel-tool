/**
 * A bordered code/media panel with an optional header strip — the same
 * hairline treatment the landing page uses for its request/response samples.
 */
export function CodeBlock({ label, code }: { label?: string; code: string }) {
  return (
    <div className="border border-line">
      {label && (
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span aria-hidden className="block h-2 w-2 border border-line-strong" />
          <span className="label-mono">{label}</span>
        </div>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-ink-soft">
        {code}
      </pre>
    </div>
  );
}
