import { forwardRef } from "react";
import type { DupeAnalysis } from "@/server/scan.functions";
import wordmark from "@/assets/dupli-wordmark.png";

type Props = {
  analysis: DupeAnalysis;
  originalImage: string | null;
  dupeImage: string | null;
};

/**
 * 1080x1350 (Instagram portrait 4:5) share card.
 *
 * Renders with inline styles (no Tailwind classes) so html-to-image is
 * insulated from any global CSS variables / @apply chains and produces a
 * pixel-identical export. Lives off-screen until export.
 */
export const ShareCard = forwardRef<HTMLDivElement, Props>(function ShareCard(
  { analysis, originalImage, dupeImage },
  ref,
) {
  const { original, dupe, matchScore, verdict, riskLevel } = analysis;
  const framing = analysis.framing ?? "classic-dupe";
  const isSteal = framing === "steal-find";
  const fallbackSavings =
    dupe && original.estimatedPriceUsd > 0
      ? Math.max(
          0,
          Math.round(
            ((original.estimatedPriceUsd - dupe.estimatedPriceUsd) /
              original.estimatedPriceUsd) *
              100,
          ),
        )
      : null;
  const savings = dupe ? (analysis.savingsPct ?? fallbackSavings ?? 0) : null;

  const verdictColor =
    verdict === "Worth the hype"
      ? "#10b981"
      : verdict === "Mixed"
        ? "#f59e0b"
        : verdict === "Skip"
          ? "#ef4444"
          : verdict === "Risky dupe"
            ? "#d97706"
            : "#6b7280";

  const riskColor =
    riskLevel === "Higher risk"
      ? "#d97706"
      : riskLevel === "Lower risk"
        ? "#10b981"
        : "#6b7280";

  return (
    <div
      ref={ref}
      style={{
        width: 1080,
        height: 1350,
        backgroundColor: "#f5f3ee",
        backgroundImage:
          "radial-gradient(circle at 20% 0%, #ffffff 0%, transparent 55%), radial-gradient(circle at 90% 100%, #e8e4dd 0%, transparent 50%)",
        fontFamily:
          "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#0d0d0d",
        padding: "72px 64px",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <img
          src={wordmark}
          alt=""
          crossOrigin="anonymous"
          style={{ height: 120, width: "auto" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {riskLevel && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                borderRadius: 999,
                backgroundColor: "#ffffff",
                border: `2px solid ${riskColor}`,
                color: riskColor,
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: riskColor,
                }}
              />
              Risk: {riskLevel.replace(" risk", "")}
            </div>
          )}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 20px",
              borderRadius: 999,
              backgroundColor: verdictColor,
              color: "#fff",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                backgroundColor: "#fff",
              }}
            />
            {verdict}
          </div>
        </div>
      </div>

      {/* Headline */}
      <div style={{ marginTop: 56 }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#6b6b6b",
          }}
        >
          {isSteal ? "You found a steal" : "We found the dupe"}
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 88,
            fontWeight: 800,
            lineHeight: 0.98,
            letterSpacing: "-0.035em",
          }}
        >
          {isSteal && savings && savings > 0
            ? `${savings}% cheaper`
            : savings !== null && savings > 0
              ? `Save ${savings}%`
              : "The dupe"}
        </div>
        {dupe && (
          <div
            style={{
              marginTop: 14,
              fontSize: 30,
              color: "#4a4a4a",
              lineHeight: 1.25,
              fontWeight: 400,
            }}
          >
            {isSteal ? (
              <>
                <span style={{ color: "#0d0d0d", fontWeight: 700 }}>
                  ${original.estimatedPriceUsd.toFixed(0)}
                </span>{" "}
                vs ${dupe.estimatedPriceUsd.toFixed(0)} name brand
              </>
            ) : (
              <>
                ${original.estimatedPriceUsd.toFixed(0)} →{" "}
                <span style={{ color: "#0d0d0d", fontWeight: 700 }}>
                  ${dupe.estimatedPriceUsd.toFixed(0)}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Product comparison */}
      <div
        style={{
          marginTop: 56,
          display: "flex",
          gap: 28,
          flex: 1,
          minHeight: 0,
        }}
      >
        <ProductCard
          label={isSteal ? "You scanned" : "Original"}
          brand={original.brand}
          name={original.productName}
          price={original.estimatedPriceUsd}
          image={originalImage}
          accent={isSteal}
        />
        <ProductCard
          label={isSteal ? "What it dupes" : "The dupe"}
          brand={dupe?.brand ?? "—"}
          name={dupe?.productName ?? "No dupe found"}
          price={dupe?.estimatedPriceUsd ?? null}
          image={dupeImage}
          accent={!isSteal}
        />
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 22,
          color: "#6b6b6b",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              backgroundColor: "#0d0d0d",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 26,
              letterSpacing: "-0.02em",
            }}
          >
            {matchScore}
          </div>
          <div style={{ lineHeight: 1.15 }}>
            <div
              style={{
                fontSize: 14,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: "#0d0d0d",
              }}
            >
              Match score
            </div>
            <div style={{ fontSize: 18 }}>out of 100</div>
          </div>
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          dupli · ai dupe finder
        </div>
      </div>
    </div>
  );
});

function ProductCard({
  label,
  brand,
  name,
  price,
  image,
  accent,
}: {
  label: string;
  brand: string;
  name: string;
  price: number | null;
  image: string | null;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        backgroundColor: "#ffffff",
        borderRadius: 32,
        padding: 28,
        boxShadow: "0 30px 80px -20px rgba(0,0,0,0.18)",
        border: accent ? "2px solid #0d0d0d" : "1px solid #e8e4dd",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 14,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          fontWeight: 700,
          color: accent ? "#0d0d0d" : "#9a9a9a",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 16,
          aspectRatio: "1 / 1",
          width: "100%",
          borderRadius: 20,
          backgroundColor: "#f5f3ee",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {image ? (
          <img
            src={image}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              padding: 12,
              boxSizing: "border-box",
            }}
          />
        ) : (
          <div style={{ fontSize: 80, color: "#cfcac0" }}>·</div>
        )}
      </div>
      <div
        style={{
          marginTop: 18,
          fontSize: 18,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#6b6b6b",
          fontWeight: 700,
        }}
      >
        {brand}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
          // clamp to 3 lines so long names don't blow out the card
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {name}
      </div>
      {price !== null && (
        <div
          style={{
            marginTop: "auto",
            paddingTop: 14,
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          ${price.toFixed(0)}
        </div>
      )}
    </div>
  );
}
