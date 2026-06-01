import { forwardRef } from "react";
import wordmark from "@/assets/dupli-wordmark.png";

type Props = {
  imageUrl: string;
  overlayText?: string | null;
};

/**
 * 1080x1350 (4:5) photo slide rendered off-screen for html-to-image
 * rasterization. Inline styles only — see ShareCard for the same pattern.
 */
export const CarouselPhotoSlide = forwardRef<HTMLDivElement, Props>(
  function CarouselPhotoSlide({ imageUrl, overlayText }, ref) {
    return (
      <div
        ref={ref}
        style={{
          width: 1080,
          height: 1350,
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#0d0d0d",
          fontFamily:
            "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <img
          src={imageUrl}
          alt=""
          crossOrigin="anonymous"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />

        {/* Subtle bottom gradient so the wordmark always reads */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 280,
            background:
              "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)",
          }}
        />

        {overlayText && (
          <div
            style={{
              position: "absolute",
              top: 80,
              left: 64,
              right: 64,
              padding: "36px 44px",
              borderRadius: 32,
              backgroundColor: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(20px)",
              boxShadow: "0 30px 80px -20px rgba(0,0,0,0.35)",
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "#ff5a5f",
                marginBottom: 12,
              }}
            >
              Now scanning
            </div>
            <div
              style={{
                fontSize: 64,
                fontWeight: 800,
                lineHeight: 1.02,
                letterSpacing: "-0.03em",
                color: "#0d0d0d",
              }}
            >
              {overlayText}
            </div>
          </div>
        )}

        <div
          style={{
            position: "absolute",
            bottom: 56,
            left: 64,
            right: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <img
            src={wordmark}
            alt=""
            crossOrigin="anonymous"
            style={{ height: 80, width: "auto", filter: "brightness(0) invert(1)" }}
          />
          <div
            style={{
              color: "#ffffff",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              opacity: 0.9,
            }}
          >
            ai dupe finder
          </div>
        </div>
      </div>
    );
  },
);
