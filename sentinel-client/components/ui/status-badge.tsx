import { Check, X, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/cn";

type StatusBadgeProps = {
  status: "accepted" | "rejected" | "stale" | "active" | "placeholder" | "calibrated" | "inactive";
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
  const iconSize = isSm ? "h-3 w-3" : "h-3.5 w-3.5";

  const styles: Record<string, string> = {
    accepted: "bg-success-bg text-success-green",
    rejected: "bg-error-bg text-error-red",
    stale: "bg-warning-bg text-warning-amber",
    placeholder: "bg-warning-bg text-warning-amber",
    calibrated: "bg-success-bg text-success-green",
    active: "bg-success-bg text-success-green",
    inactive: "bg-page text-muted border border-border",
  };

  const labels: Record<string, string> = {
    accepted: "Accepted",
    rejected: "Rejected",
    stale: "Stale",
    placeholder: "Placeholder",
    calibrated: "Calibrated",
    active: "Active",
    inactive: "Inactive",
  };

  const icons: Record<string, React.ReactNode> = {
    accepted: <Check className={iconSize} />,
    rejected: <X className={iconSize} />,
    stale: <AlertTriangle className={iconSize} />,
    placeholder: <Clock className={iconSize} />,
    calibrated: <Check className={iconSize} />,
    active: <span className={cn("block rounded-full bg-success-green", isSm ? "h-1.5 w-1.5" : "h-2 w-2")} />,
    inactive: <span className={cn("block rounded-full bg-muted", isSm ? "h-1.5 w-1.5" : "h-2 w-2")} />,
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        isSm ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm",
        styles[status] ?? styles.active,
        className,
      )}
    >
      {icons[status]}
      {label ?? labels[status] ?? status}
    </span>
  );
}
