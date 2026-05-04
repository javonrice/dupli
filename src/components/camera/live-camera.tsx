import { X } from "lucide-react";
import { useCameraStream } from "@/lib/use-camera-stream";

/** Full-screen in-app camera. Renders a live <video> with dupli chrome on top. */
export function LiveCamera({
  onCapture,
  onClose,
}: {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const { videoRef, error, ready, capture } = useCameraStream(true);

  const handleShutter = () => {
    const dataUrl = capture();
    if (dataUrl) onCapture(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex h-screen-safe flex-col bg-foreground text-background">
      {/* Live video fills the frame */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Dim scrim when not ready */}
      {!ready && !error && <div className="absolute inset-0 bg-foreground/70" />}

      {/* Top bar */}
      <div className="relative z-10 pt-safe">
        <div className="flex h-14 items-center justify-between px-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera"
            className="tap flex h-9 w-9 items-center justify-center rounded-full bg-foreground/40 text-background backdrop-blur"
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>
          <span className="font-display text-[20px] font-bold tracking-tight text-background">
            dupli<span className="text-[hsl(var(--destructive,11_85%_60%))]" style={{ color: "#FF5A4E" }}>.</span>
          </span>
          <div className="h-9 w-9" />
        </div>
      </div>

      {/* Viewfinder brackets */}
      <div className="pointer-events-none relative z-10 flex-1">
        <div className="absolute inset-x-8 top-[12%] bottom-[18%]">
          <Bracket className="left-0 top-0 border-l-2 border-t-2 rounded-tl-[14px]" />
          <Bracket className="right-0 top-0 border-r-2 border-t-2 rounded-tr-[14px]" />
          <Bracket className="left-0 bottom-0 border-l-2 border-b-2 rounded-bl-[14px]" />
          <Bracket className="right-0 bottom-0 border-r-2 border-b-2 rounded-br-[14px]" />
        </div>
      </div>

      {/* Error fallback */}
      {error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-foreground/85 px-8 text-center">
          <p className="font-display text-[17px] font-semibold text-background">
            Camera unavailable
          </p>
          <p className="text-[13px] text-background/80">{error}</p>
          <button
            type="button"
            onClick={onClose}
            className="tap mt-2 flex h-11 items-center justify-center rounded-[12px] bg-background px-5 text-[14px] font-semibold text-foreground"
          >
            Close
          </button>
        </div>
      )}

      {/* Shutter */}
      <div className="relative z-10 pb-safe">
        <div className="flex items-center justify-center pb-6 pt-3">
          <button
            type="button"
            onClick={handleShutter}
            disabled={!ready}
            aria-label="Take photo"
            className="tap flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-background/90 disabled:opacity-50"
          >
            <span className="block h-[58px] w-[58px] rounded-full bg-background" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Bracket({ className }: { className: string }) {
  return (
    <span
      className={`absolute h-7 w-7 border-background/90 ${className}`}
      aria-hidden
    />
  );
}
