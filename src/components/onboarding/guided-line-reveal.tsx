import { useEffect, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/onboarding";

/**
 * GuidedLineReveal — animates a headline first, then each subtext line one by
 * one, with a smooth fade + slight upward motion. Reusable on every onboarding
 * screen so the whole flow feels like a guided mini-lesson.
 *
 * Respects `prefers-reduced-motion` (renders everything immediately).
 */
export function GuidedLineReveal({
  headline,
  lines = [],
  delay = 80,
  stagger = 380,
  className = "",
  align = "left",
  children,
  onComplete,
}: {
  headline: ReactNode;
  lines?: ReactNode[];
  /** Delay before the headline appears (ms). */
  delay?: number;
  /** Delay between each subsequent line (ms). */
  stagger?: number;
  className?: string;
  align?: "left" | "center";
  /** Optional extra blocks (e.g. visual cards, CTA) revealed after lines. */
  children?: ReactNode | ReactNode[];
  onComplete?: () => void;
}) {
  const reduced = useReducedMotion();
  const childArray = flattenChildren(children);
  const totalSteps = 1 + lines.length + childArray.length;
  const [step, setStep] = useState(reduced ? totalSteps : 0);

  useEffect(() => {
    if (reduced) {
      onComplete?.();
      return;
    }
    let cancelled = false;
    const timeouts: number[] = [];
    for (let i = 0; i < totalSteps; i++) {
      const t = window.setTimeout(
        () => {
          if (cancelled) return;
          setStep(i + 1);
          if (i + 1 === totalSteps) onComplete?.();
        },
        delay + i * stagger,
      );
      timeouts.push(t);
    }
    return () => {
      cancelled = true;
      timeouts.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalSteps, delay, stagger, reduced]);

  const alignCls = align === "center" ? "text-center" : "text-left";
  return (
    <div className={`${alignCls} ${className}`}>
      <Reveal show={step >= 1}>
        <h1 className="font-display text-[28px] font-bold leading-[1.1] tracking-tight">
          {headline}
        </h1>
      </Reveal>
      {lines.map((line, i) => (
        <Reveal key={i} show={step >= 2 + i} className="mt-3">
          <p className="text-[15px] leading-relaxed text-muted-foreground">{line}</p>
        </Reveal>
      ))}
      {childArray.map((child, i) => (
        <Reveal key={`c-${i}`} show={step >= 1 + lines.length + i + 1} className="mt-5">
          {child}
        </Reveal>
      ))}
    </div>
  );
}

function Reveal({
  show,
  children,
  className = "",
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`transition-all duration-500 ease-out ${className} ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      }`}
      aria-hidden={!show}
    >
      {children}
    </div>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);
  return reduced;
}

function flattenChildren(children: ReactNode | ReactNode[] | undefined): ReactNode[] {
  if (children == null || children === false) return [];
  return (Array.isArray(children) ? children : [children]).filter(
    (c) => c !== null && c !== undefined && c !== false,
  );
}
