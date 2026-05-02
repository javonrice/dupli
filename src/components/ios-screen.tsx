import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

/**
 * IOSScreen — standard iOS view-controller layout primitive.
 *
 *   ┌────────────────────────┐  ← pt-safe (notch / Dynamic Island)
 *   │   navbar (44pt)        │
 *   ├────────────────────────┤
 *   │   large title          │  optional
 *   │                        │
 *   │   content              │  scrollable OR fixed
 *   │                        │
 *   ├────────────────────────┤
 *   │   bottom toolbar       │  optional, pb-safe (home indicator)
 *   └────────────────────────┘
 *
 * `fixed` = no scroll (Camera-style). Default = scrollable (Detail-style).
 */
export function IOSScreen({
  title,
  largeTitle,
  back,
  trailing,
  bottomBar,
  fixed = false,
  fullHeight = false,
  children,
}: {
  title?: string;
  largeTitle?: string;
  back?: { label?: string; onClick: () => void };
  trailing?: ReactNode;
  bottomBar?: ReactNode;
  fixed?: boolean;
  /** When true, occupy full viewport height instead of leaving room for the tab bar. */
  fullHeight?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col bg-background no-bounce ${fullHeight ? "h-screen-safe" : "h-screen-minus-tabbar"}`}
    >
      {/* Nav bar */}
      <div className="pt-safe sticky top-0 z-30 bg-background/85 backdrop-blur-xl">
        <div className="hairline-b flex h-14 items-center justify-between px-4">
          <div className="flex min-w-0 flex-1 items-center">
            {back ? (
              <button
                onClick={back.onClick}
                className="tap -ml-2 flex items-center gap-0.5 px-2 py-1 text-[17px] font-normal text-foreground"
                aria-label="Back"
              >
                <ChevronLeft className="h-6 w-6" strokeWidth={2.25} />
                {back.label && <span className="truncate">{back.label}</span>}
              </button>
            ) : (
              <span className="font-display text-[15px] font-semibold tracking-tight">
                {title}
              </span>
            )}
          </div>
          {back && title && (
            <span className="absolute left-1/2 -translate-x-1/2 text-[15px] font-semibold">
              {title}
            </span>
          )}
          <div className="flex items-center gap-2">{trailing}</div>
        </div>
        {largeTitle && (
          <div className="px-5 pb-2 pt-1">
            <h1 className="font-display text-[32px] font-bold leading-tight tracking-tight">
              {largeTitle}
            </h1>
          </div>
        )}
      </div>

      {/* Content */}
      <div
        className={
          fixed
            ? "relative flex flex-1 flex-col overflow-hidden"
            : "flex-1 overflow-y-auto overscroll-contain"
        }
      >
        {children}
      </div>

      {/* Bottom toolbar */}
      {bottomBar && (
        <div className="pb-safe hairline-t sticky bottom-0 z-30 bg-background/85 backdrop-blur-xl">
          <div className="px-4 py-2.5">{bottomBar}</div>
        </div>
      )}
    </div>
  );
}
