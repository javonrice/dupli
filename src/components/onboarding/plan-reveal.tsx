import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import type { OnboardingState } from "@/lib/onboarding";
import { estimatedYearlySavings, prefersReducedMotion } from "@/lib/onboarding";

const CATEGORY_LABEL: Record<string, string> = {
  skincare: "Skincare",
  makeup: "Makeup",
  haircare: "Haircare",
  body: "Body care",
  viral: "Viral picks",
  luxury: "Luxury beauty",
};

export function PlanReveal({ state }: { state: OnboardingState }) {
  const target = estimatedYearlySavings(state);
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const start = performance.now();
    const duration = 1200;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const cats = state.categories ?? [];
  const checks = [
    "Personalized to your shopping habits",
    cats.length
      ? `Tuned for ${cats.length} categor${cats.length === 1 ? "y" : "ies"}`
      : "Tuned for your beauty mix",
    "Strong / Good / Possible match scoring",
    "Sample dupe ready to preview",
  ];

  return (
    <div className="text-center">
      <div className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
        <Sparkles className="h-3 w-3" /> Your plan is ready
      </div>
      <p className="mt-5 text-[13px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Potential yearly savings
      </p>
      <p className="mt-1 font-display text-[64px] font-bold leading-none tracking-tight">
        ${value.toLocaleString()}
      </p>
      <p className="mt-2 text-[12px] text-muted-foreground">
        Estimate based on your answers. Not a guarantee.
      </p>

      {cats.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {cats.map((c) => (
            <span
              key={c}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold"
            >
              {CATEGORY_LABEL[c] ?? c}
            </span>
          ))}
        </div>
      )}

      <ul className="mt-6 space-y-2 text-left">
        {checks.map((c) => (
          <li
            key={c}
            className="flex items-center gap-3 rounded-[14px] border border-border bg-card px-4 py-3"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
            <span className="text-[13.5px] font-semibold">{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
