import { forwardRef } from "react";
import wordmark from "@/assets/dupli-wordmark.png";

/**
 * 1080x1350 static CTA slide. Inline styles only.
 * Inline Apple logo SVG used inside a black "Download on the App Store" pill.
 */
export const AppStoreCtaCard = forwardRef<HTMLDivElement>(
  function AppStoreCtaCard(_props, ref) {
    return (
      <div
        ref={ref}
        style={{
          width: 1080,
          height: 1350,
          position: "relative",
          overflow: "hidden",
          backgroundImage:
            "linear-gradient(135deg, #ff5a5f 0%, #ff8a9b 55%, #ffd1d8 100%)",
          fontFamily:
            "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          color: "#0d0d0d",
          padding: "96px 80px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          boxSizing: "border-box",
        }}
      >
        {/* Wordmark */}
        <img
          src={wordmark}
          alt=""
          crossOrigin="anonymous"
          style={{ width: 440, height: "auto", marginBottom: 56 }}
        />

        <div
          style={{
            fontSize: 96,
            fontWeight: 800,
            lineHeight: 1.0,
            letterSpacing: "-0.04em",
            color: "#0d0d0d",
          }}
        >
          Find your dupe.
        </div>

        <div
          style={{
            marginTop: 28,
            maxWidth: 760,
            fontSize: 30,
            lineHeight: 1.35,
            fontWeight: 500,
            color: "#1a1a1a",
            opacity: 0.85,
          }}
        >
          Scan any beauty product. Get the cheaper match in seconds.
        </div>

        {/* Download on the App Store pill */}
        <div
          style={{
            marginTop: 88,
            display: "inline-flex",
            alignItems: "center",
            gap: 22,
            backgroundColor: "#0d0d0d",
            color: "#ffffff",
            padding: "26px 44px",
            borderRadius: 22,
            boxShadow: "0 24px 60px -10px rgba(0,0,0,0.35)",
          }}
        >
          {/* Real Apple logo glyph */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 384 512"
            style={{ width: 64, height: 64, fill: "#ffffff" }}
          >
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM236.9 105.6c39.1-46.4 35.5-88.6 34.4-103.6-34.6 2-74.6 23.5-97.4 50.1-25.1 28.5-39.9 63.6-36.7 102.8 37.4 2.9 71.5-16.4 99.7-49.3z" />
          </svg>
          <div style={{ textAlign: "left", lineHeight: 1.05 }}>
            <div
              style={{
                fontSize: 16,
                letterSpacing: "0.04em",
                opacity: 0.85,
                marginBottom: 4,
              }}
            >
              Download on the
            </div>
            <div
              style={{
                fontSize: 38,
                fontWeight: 700,
                letterSpacing: "-0.01em",
              }}
            >
              App Store
            </div>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#0d0d0d",
            opacity: 0.6,
          }}
        >
          dupli · ai dupe finder
        </div>
      </div>
    );
  },
);
