import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type StatCardProps = {
  title: string;
  value: ReactNode;
  description?: string;
  badge?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function StatCard({
  title,
  value,
  description,
  badge,
  icon,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between border border-line bg-paper p-5 transition-colors hover:border-line-strong md:p-6",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="label-mono">{title}</span>
        {badge ?? (icon && <span className="text-muted">{icon}</span>)}
      </div>

      <div className="mt-4">
        <div className="font-serif text-3xl tracking-tight text-ink md:text-4xl">
          {value}
        </div>
        {description && (
          <p className="mt-2 text-xs leading-relaxed text-muted">{description}</p>
        )}
      </div>
    </div>
  );
}
