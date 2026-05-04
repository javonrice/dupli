import type { ReactNode } from "react";

/** Small note/flashcard used to surface a single insight at a time. */
export function LearningCard({
  icon,
  title,
  body,
  tone = "default",
  className = "",
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  tone?: "default" | "success" | "muted";
  className?: string;
}) {
  const toneCls =
    tone === "success"
      ? "border-success/30 bg-success-soft"
      : tone === "muted"
        ? "border-border bg-muted/40"
        : "border-border bg-card";
  return (
    <div className={`rounded-[18px] border ${toneCls} p-4 shadow-soft ${className}`}>
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-foreground">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold leading-tight tracking-tight">
            {title}
          </p>
          {body && (
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
          )}
        </div>
      </div>
    </div>
  );
}
