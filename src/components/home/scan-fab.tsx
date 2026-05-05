import { Camera, Images } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

/** Floating Action Button — primary entry point to the camera flow.
 *  Sits above the bottom tab bar so it's always thumb-reachable.
 *  Access is gated by the /_app paywall + scan entitlement middleware;
 *  this component assumes the user is already a paid subscriber. */
export function ScanFab({
  onCamera,
  onLibrary,
}: {
  onCamera: () => void;
  onLibrary: () => void;
}) {
  const [open, setOpen] = useState(false);

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
          onClick={() => setOpen(true)}
          aria-label="Scan a product"
          className="tap flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-lift"
        >
          <Camera className="h-6 w-6" strokeWidth={2.25} />
        </button>
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
