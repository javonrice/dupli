import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  TransitionSeries,
  springTiming,
} from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { loadFont as loadOutfit } from "@remotion/google-fonts/Outfit";
import { loadFont as loadFigtree } from "@remotion/google-fonts/Figtree";
import type { DupePair } from "@/lib/dashboard.functions";
import type { ReelScript, ReelSegmentKey } from "@/lib/reel-voiceover.functions";


const { fontFamily: DISPLAY } = loadOutfit("normal", {
  weights: ["700", "900"],
  subsets: ["latin"],
});
const { fontFamily: BODY } = loadFigtree("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
});

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
// Generous padding after the voiceover finishes so the next line never
// steps on the previous one, and scenes have time to breathe.
const TAIL_FRAMES = 30; // 1.0s breathing room at the end of each segment
export const TRANSITION_FRAMES = 14;
// Scan-in intro shown at the head of each reveal scene before the voiceover.
export const SCAN_INTRO_FRAMES = 28; // ~0.93s

export function segmentToFrames(durationSec: number): number {
  return Math.max(75, Math.round(durationSec * FPS) + TAIL_FRAMES);
}

function isRevealKey(key: ReelSegmentKey): boolean {
  return key === "reveal_1" || key === "reveal_2" || key === "reveal_3" || key === "reveal_4";
}

function sceneFrames(key: ReelSegmentKey, durationSec: number): number {
  return segmentToFrames(durationSec) + (isRevealKey(key) ? SCAN_INTRO_FRAMES : 0);
}





export function totalDurationInFrames(script: ReelScript): number {
  // TransitionSeries overlaps each transition by TRANSITION_FRAMES.
  const sum = script.segments.reduce(
    (acc, s) => acc + sceneFrames(s.key, s.durationSec),
    0,
  );
  return sum - TRANSITION_FRAMES * (script.segments.length - 1);
}

// Absolute start frame of each segment's audio, mirroring the TransitionSeries
// layout. Reveal scenes delay the voiceover by SCAN_INTRO_FRAMES so the scan
// animation plays before the dupe line drops.
export function audioStartFrames(script: ReelScript): number[] {
  const starts: number[] = [];
  let cursor = 0;
  script.segments.forEach((s, idx) => {
    const intro = isRevealKey(s.key) ? SCAN_INTRO_FRAMES : 0;
    starts.push(cursor + intro);
    const dur = sceneFrames(s.key, s.durationSec);
    cursor += dur - (idx === script.segments.length - 1 ? 0 : TRANSITION_FRAMES);
  });
  return starts;
}



// ---------- Shared bits ----------

function GrainOverlay() {
  return (
    <AbsoluteFill
      style={{
        backgroundImage:
          "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.06), transparent 60%), radial-gradient(circle at 70% 80%, rgba(0,0,0,0.18), transparent 55%)",
        mixBlendMode: "overlay",
      }}
    />
  );
}

function FloatingBlob({
  delay,
  color,
  size,
  x,
  y,
}: {
  delay: number;
  color: string;
  size: number;
  x: number;
  y: number;
}) {
  const frame = useCurrentFrame();
  const t = frame + delay;
  const dx = Math.sin(t / 40) * 30;
  const dy = Math.cos(t / 35) * 24;
  return (
    <div
      style={{
        position: "absolute",
        left: x + dx,
        top: y + dy,
        width: size,
        height: size,
        background: color,
        borderRadius: "50%",
        filter: "blur(80px)",
        opacity: 0.7,
      }}
    />
  );
}

function KineticWords({
  text,
  startFrame = 0,
  perWordDelay = 4,
  fontSize,
  color = "#0d0d0d",
  weight = 900,
  letterSpacing = "-0.03em",
  lineHeight = 1.02,
}: {
  text: string;
  startFrame?: number;
  perWordDelay?: number;
  fontSize: number;
  color?: string;
  weight?: number;
  letterSpacing?: string;
  lineHeight?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <div
      style={{
        fontFamily: DISPLAY,
        fontWeight: weight,
        fontSize,
        color,
        letterSpacing,
        lineHeight,
        textAlign: "center",
        textWrap: "balance",
      }}
    >
      {words.map((w, i) => {
        const f = frame - startFrame - i * perWordDelay;
        const s = spring({ frame: f, fps, config: { damping: 14, stiffness: 180 } });
        const y = interpolate(s, [0, 1], [40, 0]);
        const op = interpolate(s, [0, 1], [0, 1]);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              transform: `translateY(${y}px)`,
              opacity: op,
              marginRight: "0.28em",
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
}

function Wordmark({ scale = 1 }: { scale?: number }) {
  return (
    <div
      style={{
        fontFamily: DISPLAY,
        fontWeight: 900,
        fontSize: 64 * scale,
        letterSpacing: "-0.04em",
        color: "#0d0d0d",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      dupli
      <span
        style={{
          width: 14 * scale,
          height: 14 * scale,
          background: "#ff3b30",
          borderRadius: "50%",
          marginLeft: 6 * scale,
          marginTop: 14 * scale,
        }}
      />
    </div>
  );
}

// ---------- Scenes ----------

function HookScene({ pair, text }: { pair: DupePair; text: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const productSpring = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 110 },
  });
  const scale = interpolate(productSpring, [0, 1], [1.25, 1]);
  const drift = Math.sin(frame / 28) * 12;

  const priceTagSpring = spring({
    frame: frame - 20,
    fps,
    config: { damping: 10, stiffness: 200 },
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(135deg, #ffd9d6 0%, #f5f3ee 55%, #ffe9bf 100%)",
      }}
    >
      <FloatingBlob delay={0} color="#ff5a5f" size={520} x={-160} y={-120} />
      <FloatingBlob delay={50} color="#ffb86b" size={420} x={780} y={1300} />
      <GrainOverlay />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: 80,
        }}
      >
        <div style={{ position: "relative", marginBottom: 60 }}>
          <Img
            src={pair.original.imageUrl}
            style={{
              width: 620,
              height: 620,
              objectFit: "contain",
              transform: `scale(${scale}) translateY(${drift}px)`,
              filter: "drop-shadow(0 40px 60px rgba(0,0,0,0.25))",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: -20,
              right: -30,
              background: "#0d0d0d",
              color: "white",
              padding: "18px 28px",
              borderRadius: 100,
              fontFamily: DISPLAY,
              fontWeight: 900,
              fontSize: 56,
              letterSpacing: "-0.03em",
              transform: `rotate(8deg) scale(${priceTagSpring})`,
              boxShadow: "0 12px 30px rgba(0,0,0,0.3)",
            }}
          >
            ${pair.original.priceUsd.toFixed(0)}
          </div>
        </div>

        <KineticWords text={text} startFrame={6} fontSize={108} color="#0d0d0d" />
      </div>
    </AbsoluteFill>
  );
}

function Brackets() {
  const arm = 60;
  const thick = 8;
  const inset = 50;
  const color = "#4ade80";
  const base = {
    position: "absolute" as const,
    background: color,
    boxShadow: "0 0 16px rgba(74,222,128,0.7)",
  };
  return (
    <>
      <div style={{ ...base, top: inset, left: inset, width: arm, height: thick }} />
      <div style={{ ...base, top: inset, left: inset, width: thick, height: arm }} />
      <div style={{ ...base, top: inset, right: inset, width: arm, height: thick }} />
      <div style={{ ...base, top: inset, right: inset, width: thick, height: arm }} />
      <div style={{ ...base, bottom: inset, left: inset, width: arm, height: thick }} />
      <div style={{ ...base, bottom: inset, left: inset, width: thick, height: arm }} />
      <div style={{ ...base, bottom: inset, right: inset, width: arm, height: thick }} />
      <div style={{ ...base, bottom: inset, right: inset, width: thick, height: arm }} />
    </>
  );
}

function ScanScene({ pair, text }: { pair: DupePair; text: string }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const scanProgress = interpolate(
    frame,
    [10, durationInFrames - 20],
    [0, 1],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" },
  );
  const scanY = interpolate(scanProgress, [0, 1], [0, 680]);

  const phoneSpring = spring({ frame, fps, config: { damping: 18, stiffness: 130 } });
  const phoneScale = interpolate(phoneSpring, [0, 1], [0.85, 1]);

  return (
    <AbsoluteFill
      style={{ background: "linear-gradient(180deg, #0d0d0d 0%, #1a1a2e 100%)" }}
    >
      <FloatingBlob delay={0} color="#4f46e5" size={580} x={-180} y={1100} />
      <FloatingBlob delay={30} color="#ff5a5f" size={440} x={720} y={-80} />
      <GrainOverlay />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 60,
        }}
      >
        <div
          style={{
            width: 720,
            height: 880,
            background: "#0d0d0d",
            borderRadius: 70,
            padding: 18,
            border: "3px solid #2a2a3a",
            boxShadow: "0 40px 80px rgba(0,0,0,0.6)",
            transform: `scale(${phoneScale})`,
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 56,
              background: "#1a1a2e",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <Img
              src={pair.original.imageUrl}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                padding: 40,
              }}
            />
            <Brackets />
            <div
              style={{
                position: "absolute",
                left: 40,
                right: 40,
                top: 80 + scanY,
                height: 4,
                background:
                  "linear-gradient(90deg, transparent, #4ade80, transparent)",
                boxShadow: "0 0 30px #4ade80, 0 0 60px #4ade80",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 40,
                right: 40,
                top: 80,
                height: scanY,
                background:
                  "linear-gradient(180deg, transparent, rgba(74,222,128,0.18))",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 30,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(13,13,13,0.85)",
                color: "#4ade80",
                padding: "12px 24px",
                borderRadius: 999,
                fontFamily: BODY,
                fontWeight: 700,
                fontSize: 26,
                letterSpacing: "0.05em",
              }}
            >
              SCANNING…
            </div>
          </div>
        </div>

        <div style={{ marginTop: 60, maxWidth: 900 }}>
          <KineticWords text={text} startFrame={8} fontSize={92} color="#f5f3ee" />
        </div>
      </div>
    </AbsoluteFill>
  );
}

function ProductCard({
  label,
  brand,
  imageUrl,
  price,
  tint,
  bg,
  opacity,
  translateX,
  dimmed,
}: {
  label: string;
  brand: string;
  imageUrl: string;
  price: number;
  tint: string;
  bg: string;
  opacity: number;
  translateX: number;
  dimmed?: boolean;
}) {
  const textColor = bg === "#0d0d0d" ? "#f5f3ee" : "#0d0d0d";
  return (
    <div
      style={{
        flex: 1,
        background: bg,
        borderRadius: 36,
        padding: 28,
        opacity,
        transform: `translateX(${translateX}px)`,
        boxShadow: "0 24px 60px rgba(0,0,0,0.15)",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div
        style={{
          fontFamily: BODY,
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: "0.22em",
          color: tint,
        }}
      >
        {label}
      </div>
      <div
        style={{
          width: "100%",
          aspectRatio: "1/1",
          background: bg === "#0d0d0d" ? "#1f1f1f" : "#f0ece4",
          borderRadius: 24,
          padding: 16,
          filter: dimmed ? "grayscale(0.5)" : "none",
        }}
      >
        <Img
          src={imageUrl}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>
      <div
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: 32,
          letterSpacing: "-0.02em",
          color: textColor,
          textOverflow: "ellipsis",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        {brand}
      </div>
      <div
        style={{
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontSize: 64,
          letterSpacing: "-0.04em",
          color: textColor,
          lineHeight: 1,
        }}
      >
        ${price.toFixed(0)}
      </div>
    </div>
  );
}

function ScanIntroOverlay({ pair, intro }: { pair: DupePair; intro: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phone pops in, scan sweeps top→bottom, then everything fades out.
  const phoneSpring = spring({ frame, fps, config: { damping: 18, stiffness: 160 } });
  const phoneScale = interpolate(phoneSpring, [0, 1], [0.7, 1]);

  const scanProgress = interpolate(frame, [4, intro - 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scanY = interpolate(scanProgress, [0, 1], [0, 520]);

  // Fade out the whole viewfinder in the last 6 frames of the intro.
  const fade = interpolate(frame, [intro - 6, intro], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "MATCH FOUND" flash at the end of the scan.
  const flashSpring = spring({
    frame: frame - (intro - 10),
    fps,
    config: { damping: 10, stiffness: 220 },
  });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, rgba(13,13,13,0.92) 0%, rgba(26,26,46,0.92) 100%)",
        opacity: fade,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 620,
          height: 760,
          background: "#0d0d0d",
          borderRadius: 60,
          padding: 16,
          border: "3px solid #2a2a3a",
          boxShadow: "0 40px 80px rgba(0,0,0,0.6)",
          transform: `scale(${phoneScale})`,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 48,
            background: "#1a1a2e",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Img
            src={pair.original.imageUrl}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              padding: 36,
            }}
          />
          <Brackets />
          <div
            style={{
              position: "absolute",
              left: 32,
              right: 32,
              top: 70 + scanY,
              height: 4,
              background: "linear-gradient(90deg, transparent, #4ade80, transparent)",
              boxShadow: "0 0 30px #4ade80, 0 0 60px #4ade80",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 32,
              right: 32,
              top: 70,
              height: scanY,
              background: "linear-gradient(180deg, transparent, rgba(74,222,128,0.18))",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 26,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(13,13,13,0.85)",
              color: scanProgress < 1 ? "#4ade80" : "#ffffff",
              padding: "12px 26px",
              borderRadius: 999,
              fontFamily: BODY,
              fontWeight: 700,
              fontSize: 24,
              letterSpacing: "0.08em",
              border: scanProgress >= 1 ? "2px solid #4ade80" : "none",
            }}
          >
            {scanProgress < 1 ? "SCANNING…" : "MATCH FOUND"}
          </div>
        </div>
      </div>

      {/* MATCH FOUND burst */}
      {scanProgress >= 1 && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: `translate(-50%, -50%) scale(${flashSpring})`,
            background: "#ff3b30",
            color: "white",
            padding: "20px 44px",
            borderRadius: 999,
            fontFamily: DISPLAY,
            fontWeight: 900,
            fontSize: 48,
            letterSpacing: "-0.02em",
            boxShadow: "0 20px 50px rgba(255,59,48,0.5)",
          }}
        >
          {pair.matchPct}% MATCH
        </div>
      )}
    </AbsoluteFill>
  );
}

function CompareScene({
  pair,
  text,
  intro = 0,
}: {
  pair: DupePair;
  text: string;
  intro?: number;
}) {
  const rawFrame = useCurrentFrame();
  // Shift all compare animations until AFTER the scan intro finishes.
  const frame = rawFrame - intro;
  const { fps } = useVideoConfig();

  const leftSpring = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });
  const rightSpring = spring({
    frame: frame - 8,
    fps,
    config: { damping: 16, stiffness: 140 },
  });
  const badgeSpring = spring({
    frame: frame - 22,
    fps,
    config: { damping: 8, stiffness: 200 },
  });

  const priceProgress = interpolate(frame, [30, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const animatedSavings = Math.round(
    interpolate(priceProgress, [0, 1], [0, pair.savingsUsd]),
  );

  return (
    <AbsoluteFill
      style={{ background: "linear-gradient(180deg, #f5f3ee 0%, #ffe9d4 100%)" }}
    >
      <GrainOverlay />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          padding: 70,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 24,
            alignItems: "stretch",
            marginTop: 120,
            position: "relative",
          }}
        >
          <ProductCard
            label="ORIGINAL"
            brand={pair.original.brand}
            imageUrl={pair.original.imageUrl}
            price={pair.original.priceUsd}
            tint="#0d0d0d"
            bg="#ffffff"
            opacity={leftSpring}
            translateX={interpolate(leftSpring, [0, 1], [-60, 0])}
            dimmed
          />
          <ProductCard
            label="DUPE"
            brand={pair.dupe.brand}
            imageUrl={pair.dupe.imageUrl}
            price={pair.dupe.priceUsd}
            tint="#ff3b30"
            bg="#0d0d0d"
            opacity={rightSpring}
            translateX={interpolate(rightSpring, [0, 1], [60, 0])}
          />

          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `translate(-50%, -50%) rotate(-8deg) scale(${badgeSpring})`,
              background: "#ff3b30",
              color: "white",
              borderRadius: "50%",
              width: 220,
              height: 220,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 20px 50px rgba(255,59,48,0.45)",
              border: "5px solid #f5f3ee",
            }}
          >
            <div
              style={{
                fontFamily: DISPLAY,
                fontWeight: 900,
                fontSize: 76,
                letterSpacing: "-0.04em",
                lineHeight: 1,
              }}
            >
              {pair.matchPct}%
            </div>
            <div
              style={{
                fontFamily: BODY,
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: "0.18em",
                marginTop: 4,
              }}
            >
              MATCH
            </div>
          </div>
        </div>

        <div style={{ marginTop: 60, textAlign: "center" }}>
          <div
            style={{
              fontFamily: BODY,
              fontWeight: 700,
              fontSize: 36,
              letterSpacing: "0.2em",
              color: "#0d0d0d",
              opacity: 0.6,
              marginBottom: 8,
            }}
          >
            YOU SAVE
          </div>
          <div
            style={{
              fontFamily: DISPLAY,
              fontWeight: 900,
              fontSize: 220,
              letterSpacing: "-0.05em",
              color: "#0d0d0d",
              lineHeight: 0.95,
            }}
          >
            ${animatedSavings}
          </div>
        </div>

        <div style={{ marginTop: 40, maxWidth: 900, alignSelf: "center" }}>
          <KineticWords
            text={text}
            startFrame={36}
            fontSize={56}
            color="#0d0d0d"
            weight={700}
          />
        </div>
      </div>

      {/* Scan-in intro plays on top of (and hides) the compare layout for the
          first SCAN_INTRO_FRAMES of the scene. Mirrors the in-app scanner. */}
      {intro > 0 && rawFrame < intro && (
        <Sequence from={0} durationInFrames={intro}>
          <ScanIntroOverlay pair={pair} intro={intro} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
}


function CtaScene({ text }: { text: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const markSpring = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  const markScale = interpolate(markSpring, [0, 1], [0.4, 1]);

  const badgeSpring = spring({
    frame: frame - 30,
    fps,
    config: { damping: 16, stiffness: 130 },
  });
  const badgeY = interpolate(badgeSpring, [0, 1], [120, 0]);

  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(135deg, #ff5a5f 0%, #ff3b30 50%, #ff8a3d 100%)",
      }}
    >
      <FloatingBlob delay={0} color="#ffffff" size={520} x={-120} y={-100} />
      <FloatingBlob delay={20} color="#fff3a8" size={460} x={700} y={1400} />
      <GrainOverlay />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 80,
          gap: 50,
        }}
      >
        <div
          style={{
            transform: `scale(${markScale})`,
            background: "#f5f3ee",
            padding: "30px 70px",
            borderRadius: 100,
            boxShadow: "0 30px 60px rgba(0,0,0,0.25)",
          }}
        >
          <Wordmark scale={1.4} />
        </div>

        <KineticWords text={text} startFrame={10} fontSize={96} color="#ffffff" />

        <div
          style={{
            transform: `translateY(${badgeY}px)`,
            opacity: badgeSpring,
            background: "#0d0d0d",
            color: "white",
            padding: "26px 60px",
            borderRadius: 24,
            fontFamily: BODY,
            fontWeight: 700,
            fontSize: 36,
            letterSpacing: "0.02em",
            marginTop: 20,
            boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
          }}
        >
          ⬇  Download on the App Store
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ---------- Composition ----------

export type DupeReelProps = {
  script: ReelScript;
};

export function DupeReel({ script }: DupeReelProps) {
  const [p0, p1, p2, p3] = script.pairs;
  const INTRO = SCAN_INTRO_FRAMES;
  const sceneOrder: Array<{
    key: ReelSegmentKey;
    render: (text: string) => React.ReactNode;
  }> = [
    { key: "hook", render: (t) => <HookScene pair={p0} text={t} /> },
    { key: "reveal_1", render: (t) => <CompareScene pair={p0} text={t} intro={INTRO} /> },
    { key: "reveal_2", render: (t) => <CompareScene pair={p1} text={t} intro={INTRO} /> },
    { key: "reveal_3", render: (t) => <CompareScene pair={p2} text={t} intro={INTRO} /> },
    { key: "reveal_4", render: (t) => <CompareScene pair={p3} text={t} intro={INTRO} /> },
    { key: "cta", render: (t) => <CtaScene text={t} /> },
  ];

  // Build sequence durations + absolute audio start positions accounting for
  // transition overlap (each transition overlaps surrounding sequences by
  // TRANSITION_FRAMES) and the scan intro that delays reveal voiceovers.
  let audioCursor = 0;
  const placed = sceneOrder.map(({ key, render }, idx) => {
    const seg = script.segments.find((s) => s.key === key);
    if (!seg) throw new Error(`Missing segment ${key}`);
    const dur = sceneFrames(key, seg.durationSec);
    const introOffset = isRevealKey(key) ? INTRO : 0;
    const audioFrom = audioCursor + introOffset;
    audioCursor += dur - (idx === sceneOrder.length - 1 ? 0 : TRANSITION_FRAMES);
    return { key, render, seg, dur, audioFrom };
  });

  return (
    <AbsoluteFill style={{ background: "#0d0d0d" }}>
      <TransitionSeries>
        {placed.flatMap((p, idx) => {
          const nodes: React.ReactNode[] = [
            <TransitionSeries.Sequence
              key={`s-${p.key}`}
              durationInFrames={p.dur}
            >
              {p.render(p.seg.text)}
            </TransitionSeries.Sequence>,
          ];
          if (idx < placed.length - 1) {
            nodes.push(
              <TransitionSeries.Transition
                key={`t-${p.key}`}
                presentation={slide()}
                timing={springTiming({
                  config: { damping: 200 },
                  durationInFrames: TRANSITION_FRAMES,
                })}
              />,
            );
          }
          return nodes;
        })}
      </TransitionSeries>

      {placed.map((p) => (
        <Sequence
          key={`a-${p.key}`}
          from={p.audioFrom}
          durationInFrames={p.dur}
        >
          <Audio src={p.seg.audioDataUrl} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

