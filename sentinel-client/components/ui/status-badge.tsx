import { Check, X, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/cn";

type StatusBadgeProps = {
  status: "accepted" | "rejected" | "stale" | "active" | "placeholder" | "calibrated";
  label?: string;
  size?: "sm" | "md";
  className?: string;
};

export function StatusBadge({
  status,
  label,
  size = "sm",
  className,
}: StatusBadgeProps) {
  const isSm = size === "sm";

  switch (status) {
    case "accepted":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 border border-line-strong bg-paper text-ink font-mono font-medium tracking-wider",
            isSm ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
            className,
          )}
        >
          <Check className={isSm ? "h-3 w-3 text-ink" : "h-3.5 w-3.5 text-ink"} />
          {label ?? "ACCEPTED"}
        </span>
      );

    case "rejected":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 border border-ink bg-ink text-paper font-mono font-medium tracking-wider",
            isSm ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
            className,
          )}
        >
          <X className={isSm ? "h-3 w-3 text-paper" : "h-3.5 w-3.5 text-paper"} />
          {label ?? "REJECTED"}
        </span>
      );

    case "stale":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 border border-line-strong bg-paper-soft text-muted font-mono tracking-wider",
            isSm ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
            className,
          )}
        >
          <AlertTriangle className={isSm ? "h-3 w-3" : "h-3.5 w-3.5"} />
          {label ?? "STALE"}
        </span>
      );

    case "placeholder":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 border border-line bg-paper-soft text-muted font-mono tracking-wider",
            isSm ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
            className,
          )}
        >
          <Clock className={isSm ? "h-3 w-3" : "h-3.5 w-3.5"} />
          {label ?? "PLACEHOLDER"}
        </span>
      );

    case "calibrated":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 border border-line-strong bg-paper text-ink font-mono tracking-wider",
            isSm ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
            className,
          )}
        >
          <Check className={isSm ? "h-3 w-3" : "h-3.5 w-3.5"} />
          {label ?? "CALIBRATED"}
        </span>
      );

    case "active":
    default:
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 border border-line-strong bg-paper text-ink font-mono tracking-wider",
            isSm ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
            className,
          )}
        >
          <span className="h-1.5 w-1.5 bg-ink" />
          {label ?? "ACTIVE"}
        </span>
      );
  }
}
