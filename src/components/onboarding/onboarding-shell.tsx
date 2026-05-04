import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

/** Shared chrome for every onboarding screen: safe areas, progress bar,
 *  optional back button, sticky primary CTA. */
export function OnboardingShell({
  step,
  total,
  onBack,
  hideProgress = false,
  primary,
  secondary,
  tertiary,
  textLink,
  children,
}: {
  step: number;
  total: number;
  onBack?: () => void;
  hideProgress?: boolean;
  primary?: { label: string; onClick: () => void; disabled?: boolean };
  secondary?: { label: string; onClick: () => void };
  tertiary?: { label: string; onClick: () => void };
  textLink?: { label: string; onClick: () => void };
  children: ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, (step / total) * 100));
  return (
    <div className="flex h-screen-safe flex-col bg-background no-bounce">
      <div className="pt-safe" />
      <div className="px-4 pt-2 pb-3">
        <div className="flex h-9 items-center gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="tap -ml-2 flex h-9 w-9 items-center justify-center rounded-full text-foreground"
              aria-label="Back"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2.25} />
            </button>
          ) : (
            <div className="h-9 w-9" aria-hidden />
          )}
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-foreground transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="w-9" aria-hidden />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-2">
        {children}
      </div>

      {(primary || secondary || tertiary || textLink) && (
        <div className="pb-safe sticky bottom-0 bg-gradient-to-t from-background via-background to-background/0 px-6 pt-3">
          <div className="space-y-2 pb-3">
            {primary && (
              <button
                type="button"
                onClick={primary.onClick}
                disabled={primary.disabled}
                className="tap flex h-[54px] w-full items-center justify-center rounded-[16px] bg-foreground text-[15px] font-semibold text-background shadow-lift transition-opacity disabled:opacity-40"
              >
                {primary.label}
              </button>
            )}
            {secondary && (
              <button
                type="button"
                onClick={secondary.onClick}
                className="tap flex h-[52px] w-full items-center justify-center rounded-[16px] bg-secondary text-[15px] font-semibold text-foreground"
              >
                {secondary.label}
              </button>
            )}
            {tertiary && (
              <button
                type="button"
                onClick={tertiary.onClick}
                className="tap flex h-[48px] w-full items-center justify-center rounded-[14px] border border-border bg-card text-[14px] font-semibold text-foreground"
              >
                {tertiary.label}
              </button>
            )}
            {textLink && (
              <button
                type="button"
                onClick={textLink.onClick}
                className="tap w-full text-center text-[13px] font-medium text-muted-foreground underline-offset-4 hover:underline"
              >
                {textLink.label}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
