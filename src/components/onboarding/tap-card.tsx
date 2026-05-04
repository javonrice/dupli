import type { ReactNode } from "react";
import { Check } from "lucide-react";

/** Big, tappable answer card. Cal AI–style — auto-advances on tap.
 *  Use a brief active state for selection feedback before navigating. */
export function TapCard({
  icon,
  title,
  subtitle,
  active = false,
  onClick,
  className = "",
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  active?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap group flex w-full items-center justify-between gap-3 rounded-[18px] border px-4 py-4 text-left transition-all active:scale-[0.985] ${
        active
          ? "border-foreground bg-foreground text-background shadow-lift"
          : "border-border bg-card text-foreground hover:border-foreground/40"
      } ${className}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {icon && (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              active ? "bg-background/15 text-background" : "bg-foreground/5 text-foreground"
            }`}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-[16px] font-semibold leading-tight tracking-tight">
            {title}
          </p>
          {subtitle && (
            <p
              className={`mt-0.5 line-clamp-1 text-[12px] ${
                active ? "text-background/75" : "text-muted-foreground"
              }`}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all ${
          active
            ? "border-background bg-background text-foreground"
            : "border-border bg-background"
        }`}
      >
        {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}
