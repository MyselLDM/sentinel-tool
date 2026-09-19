/**
 * A code sample rendered with daisyUI's `mockup-code` (window dots + per-line
 * `<pre>` so long lines scroll).
 *
 * daisyUI's mockup defaults to `--color-neutral` (near-black) here, which would
 * be the only dark surface on the page — so it is restyled to the docs' light,
 * hairline look (paper-soft fill + `border-line`). Drop the three overrides
 * below (`border border-line bg-paper-soft text-ink-soft`) for the default dark
 * terminal treatment.
 */
export function CodeBlock({ label, code }: { label?: string; code: string }) {
  const lines = code.split("\n");

  return (
    <figure>
      {label && <figcaption className="label-mono mb-2">{label}</figcaption>}
      <div className="mockup-code w-full border border-line bg-paper-soft px-4 font-mono text-[12.5px] leading-relaxed text-ink-soft">
        {lines.map((line, index) => (
          // Static, ordered content — the index is a stable key here.
          <pre key={index}>
            <code>{line.length > 0 ? line : " "}</code>
          </pre>
        ))}
      </div>
    </figure>
  );
}
