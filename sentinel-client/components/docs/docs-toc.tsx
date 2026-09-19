"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

export type TocItem = {
  id: string;
  label: string;
  children?: TocItem[];
};

/**
 * The docs "on this page" sidebar. Links are plain anchors (they work without
 * JS); an IntersectionObserver only adds the active-section highlight.
 */
export function DocsToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    const ids = items.flatMap((item) => [item.id, ...(item.children?.map((c) => c.id) ?? [])]);
    const headings = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const firstVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (firstVisible) setActive(firstVisible.target.id);
      },
      { rootMargin: "-88px 0px -65% 0px" },
    );
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="On this page">
      <p className="label-mono">On this page</p>
      <ul className="mt-4 flex flex-col gap-1 text-sm">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? "location" : undefined}
              className={cn(
                "block transition-colors hover:text-ink",
                active === item.id ? "text-ink" : "text-muted",
              )}
            >
              {item.label}
            </a>

            {item.children && item.children.length > 0 && (
              <ul className="mt-1 flex flex-col gap-0.5 border-l border-line pl-3">
                {item.children.map((child) => (
                  <li key={child.id}>
                    <a
                      href={`#${child.id}`}
                      aria-current={active === child.id ? "location" : undefined}
                      className={cn(
                        "block font-mono text-[11px] transition-colors hover:text-ink",
                        active === child.id ? "text-ink" : "text-muted",
                      )}
                    >
                      {child.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
