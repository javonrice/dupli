import { Camera, Images, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useSubscription } from "@/hooks/use-subscription";
import { readScanBlock, formatResetCountdown } from "@/lib/scan-quota";

/** Floating Action Button — primary entry point to the camera flow.
 *  Sits above the bottom tab bar so it's always thumb-reachable.
 *  Free users who've used their 3 daily scans see a locked state that
 *  routes to /paywall instead of opening the camera. */
export function ScanFab({
  onCamera,
  onLibrary,
}: {
  onCamera: () => void;
  onLibrary: () => void;
}) {
  const navigate = useNavigate();
  const { isActive } = useSubscription();
  const [open, setOpen] = useState(false);
  const [block, setBlock] = useState(() => readScanBlock());

  // Re-evaluate the block state every minute so the countdown stays fresh and
  // the FAB unlocks itself at UTC midnight without a refresh.
  useEffect(() => {
    if (isActive) return;
    const id = window.setInterval(() => setBlock(readScanBlock()), 60_000);
    return () => window.clearInterval(id);
  }, [isActive]);

  const blocked = !isActive && block.blocked;

  const handleFabClick = () => {
    if (blocked) {
      navigate({ to: "/paywall" });
      return;
    }
    setOpen(true);
  };

  const handleCamera = () => {
    setOpen(false);
    setTimeout(onCamera, 50);
  };
  const handleLibrary = () => {
    setOpen(false);
    setTimeout(onLibrary, 50);
  };

  return (
    <>
      <div
        className="fixed right-4 z-40 flex flex-col items-end gap-1"
        style={{ bottom: "calc(var(--tab-bar-h) + 12px)" }}
      >
        <button
          type="button"
          onClick={handleFabClick}
          aria-label={blocked ? "Daily scan limit reached — upgrade" : "Scan a product"}
          className="tap flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-lift"
        >
          {blocked ? (
            <Lock className="h-5 w-5" strokeWidth={2.25} />
          ) : (
            <Camera className="h-6 w-6" strokeWidth={2.25} />
          )}
        </button>
        {blocked && block.resetAt && (
          <span className="rounded-full bg-foreground/90 px-2 py-0.5 text-[10px] font-semibold text-background shadow-lift">
            Resets in {formatResetCountdown(block.resetAt)}
          </span>
        )}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-[24px] border-t border-border bg-background pb-safe"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="font-display text-[20px] font-bold tracking-tight">
              Scan a product
            </SheetTitle>
            <SheetDescription className="text-[13px]">
              Point your camera at the front of any beauty product.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleCamera}
              className="tap flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-foreground text-[15px] font-semibold text-background"
            >
              <Camera className="h-[18px] w-[18px]" strokeWidth={2} />
              Take Photo
            </button>
            <button
              type="button"
              onClick={handleLibrary}
              className="tap flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-secondary text-[15px] font-semibold text-foreground"
            >
              <Images className="h-[18px] w-[18px]" strokeWidth={2} />
              Choose from Library
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
