import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Check,
  Droplets,
  Brush,
  Scissors,
  Hand,
  Star,
  ShoppingBag,
  Flame,
  Search,
  ScanLine,
  Layers,
  PiggyBank,
  Repeat,
  TrendingDown,
  ShieldCheck,
} from "lucide-react";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import dupliWordmark from "@/assets/dupli-wordmark.png";
import heroCameraScan from "@/assets/onboarding/hero-camera-scan.webp";
import problemImage from "@/assets/onboarding/problem-overpaying.webp";
import painImage from "@/assets/onboarding/pain-regret.webp";
import previewScanImage from "@/assets/onboarding/preview-scan.webp";
import previewResultsImage from "@/assets/onboarding/preview-results.webp";
import previewCompareImage from "@/assets/onboarding/preview-compare.webp";
import planReadyImage from "@/assets/onboarding/plan-ready.webp";
import { GuidedLineReveal } from "@/components/onboarding/guided-line-reveal";
import { TapCard } from "@/components/onboarding/tap-card";
import {
  markOnboardingComplete,
  track,
  writeOnboarding,
  type Category,
} from "@/lib/onboarding";
import {
  completeOnboarding,
  saveOnboardingAnswers,
} from "@/server/onboarding.functions";

export const Route = createFileRoute("/onboarding/")({
  component: OnboardingPage,
  validateSearch: (s: Record<string, unknown>): { start?: "quiz" } => {
    return s.start === "quiz" ? { start: "quiz" } : {};
  },
  beforeLoad: async ({ search }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();

    if (search.start === "quiz") {
      if (!data.session) {
        throw redirect({ to: "/onboarding" });
      }
      try {
        const { getRouteResolution } = await import(
          "@/server/onboarding.functions"
        );
        const res = await getRouteResolution();
        if (res.onboardingCompleted) {
          throw redirect({ to: "/" });
        }
      } catch (e) {
        const { isRedirect } = await import("@tanstack/react-router");
        if (isRedirect(e)) throw e;
        const { isAuthError, clearStaleClientState } = await import(
          "@/lib/auth-reset"
        );
        if (isAuthError(e)) {
          try {
            await supabase.auth.signOut();
          } catch {
            /* ignore */
          }
          clearStaleClientState();
          throw redirect({ to: "/onboarding" });
        }
      }
      return;
    }

    // Anonymous (or stale-session) visitors land here. If a session exists,
    // route by canonical destination (NOT a blanket redirect to "/", which
    // creates a /onboarding → /onboarding/email → / → /onboarding loop).
    if (data.session) {
      try {
        const { getRouteResolution } = await import(
          "@/server/onboarding.functions"
        );
        const res = await getRouteResolution();
        const dest = res.destination;
        if (dest.to === "/app" || dest.to === "/paywall") {
          if (import.meta.env.DEV) console.debug("[onboarding-flow] welcome beforeLoad redirect", dest.to);
          throw redirect({ to: dest.to });
        }
        if (dest.to === "/onboarding" && dest.search?.start === "quiz") {
          if (import.meta.env.DEV) console.debug("[onboarding-flow] welcome beforeLoad redirect /onboarding?start=quiz");
          throw redirect({ to: "/onboarding", search: { start: "quiz" } });
        }
        // dest is /onboarding (welcome) — render the splash.
        return;
      } catch (e) {
        const { isRedirect } = await import("@tanstack/react-router");
        if (isRedirect(e)) throw e;
        const { isAuthError, clearStaleClientState } = await import(
          "@/lib/auth-reset"
        );
        if (isAuthError(e)) {
          try {
            await supabase.auth.signOut();
          } catch {
            /* ignore */
          }
          clearStaleClientState();
          // fall through and render the splash
          return;
        }
        // Transient — render splash, don't redirect.
        return;
      }
    }
  },
  head: () => ({
    meta: [
      { title: "Welcome to Dupli" },
      {
        name: "description",
        content:
          "See how Dupli helps you find lower-cost beauty matches before you overpay.",
      },
    ],
  }),
});

type CategoryChoice = "skincare" | "makeup" | "haircare" | "body" | "everything";
type Pain =
  | "too_expensive"
  | "viral_regret"
  | "cant_tell_similar"
  | "want_swaps"
  | "waste_money";
type Commitment =
  | "one_dupe_month"
  | "avoid_bad"
  | "compare_before"
  | "save_every_shop"
  | "smarter_routine";

type Step =
  | "welcome"
  | "problem"
  | "category"
  | "pain"
  | "preview_scan"
  | "preview_results"
  | "preview_compare"
  | "commitment"
  | "building"
  | "plan_ready";

const ORDER: Step[] = [
  "welcome",
  "problem",
  "category",
  "pain",
  "preview_scan",
  "preview_results",
  "preview_compare",
  "commitment",
  "building",
  "plan_ready",
];

const TOTAL = ORDER.length - 1; // welcome doesn't show progress

function OnboardingPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [step, setStep] = useState<Step>(
    search.start === "quiz" ? "problem" : "welcome",
  );
  const [categoryChoice, setCategoryChoice] = useState<CategoryChoice | undefined>();
  const [pain, setPain] = useState<Pain | undefined>();
  const [commitment, setCommitment] = useState<Commitment | undefined>();

  useEffect(() => {
    track("onboarding_started");
  }, []);
  useEffect(() => {
    track("onboarding_screen_viewed", { step });
  }, [step]);

  // Quiz steps require auth.
  useEffect(() => {
    if (step === "welcome") return;
    if (search.start === "quiz") return;
    let cancelled = false;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getSession();
      if (!cancelled && !data.session) {
        navigate({ to: "/onboarding", replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, navigate, search.start]);

  const progress = useMemo(() => Math.max(1, ORDER.indexOf(step)), [step]);

  const goNext = (s: Step) => () => setStep(s);
  const goBack = (s: Step) => () => setStep(s);
  const tapAdvance = (next: Step, ms = 220) => {
    window.setTimeout(() => setStep(next), ms);
  };

  /* ------------------------------ Screens ------------------------------ */

  if (step === "welcome") {
    return (
      <OnboardingShell
        step={1}
        total={TOTAL}
        hideProgress
        primary={{ label: "Get Started", onClick: () => navigate({ to: "/onboarding/email" }) }}
      >
        <div className="relative -mx-6 -mt-2 flex h-full flex-col">
          <div className="relative h-[44vh] min-h-[240px] max-h-[440px] w-full overflow-hidden">
            <img
              src={heroCameraScan}
              alt="Scanning a beauty product with Dupli"
              className="absolute inset-0 h-full w-full object-cover animate-[hero-zoom_8s_ease-out_forwards]"
              draggable={false}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
            <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-foreground/70 px-2.5 py-1 text-[11px] font-semibold text-background backdrop-blur animate-[hero-fade_700ms_ease-out_400ms_both]">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Live scan
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center px-5 pt-3 text-center">
            <img
              src={dupliWordmark}
              alt="Dupli"
              className="h-9 w-auto select-none sm:h-10"
              draggable={false}
            />
            <h1 className="mt-3 max-w-[20rem] font-display text-[24px] font-bold leading-[1.05] tracking-tight sm:mt-4 sm:text-[26px]">
              Snap a product. Find the dupe.
            </h1>
            <p className="mt-2 max-w-[20rem] text-[13.5px] leading-relaxed text-muted-foreground sm:text-[14px]">
              Point your camera at any beauty product to find a lower-cost match in seconds.
            </p>
            <div className="mt-4 flex items-center gap-1 sm:mt-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-warning text-warning" strokeWidth={1.5} />
              ))}
              <span className="ml-1.5 text-[12px] font-semibold text-muted-foreground">
                4.8 · 12,000+ shoppers
              </span>
            </div>
          </div>
        </div>
        <style>{`
          @keyframes hero-zoom {
            from { transform: scale(1.08); }
            to { transform: scale(1); }
          }
          @keyframes hero-fade {
            from { opacity: 0; transform: translateY(-6px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </OnboardingShell>
    );
  }

  /* 1. Problem */
  if (step === "problem") {
    return (
      <OnboardingShell
        step={progress}
        total={TOTAL}
        primary={{ label: "Continue", onClick: goNext("category") }}
      >
        <GuidedLineReveal
          headline="Stop overpaying for beauty products."
          lines={[
            "Dupli helps you scan beauty products, compare them, and find cheaper alternatives before you buy.",
          ]}
        >
          <ProductHero src={problemImage} alt="A luxury serum next to a near-identical cheaper alternative" badge="Avg. $58 saved per swap" />
        </GuidedLineReveal>
      </OnboardingShell>
    );
  }

  /* 2. Category */
  if (step === "category") {
    const opts: { v: CategoryChoice; label: string; icon: React.ReactNode }[] = [
      { v: "skincare", label: "Skincare", icon: <Droplets className="h-5 w-5" /> },
      { v: "makeup", label: "Makeup", icon: <Brush className="h-5 w-5" /> },
      { v: "haircare", label: "Haircare", icon: <Scissors className="h-5 w-5" /> },
      { v: "body", label: "Body care", icon: <Hand className="h-5 w-5" /> },
      { v: "everything", label: "Everything", icon: <Sparkles className="h-5 w-5" /> },
    ];
    const mapToCategories = (c: CategoryChoice): Category[] => {
      if (c === "everything") return ["skincare", "makeup", "haircare", "body", "viral", "luxury"];
      return [c as Category];
    };
    return (
      <OnboardingShell step={progress} total={TOTAL} onBack={goBack("problem")}>
        <GuidedLineReveal headline="What do you want Dupli to help you save on?" />
        <div className="mt-6 space-y-2.5">
          {opts.map((o) => (
            <TapCard
              key={o.v}
              icon={o.icon}
              title={o.label}
              active={categoryChoice === o.v}
              onClick={() => {
                setCategoryChoice(o.v);
                writeOnboarding({ categories: mapToCategories(o.v) });
                track("onboarding_categories_selected", { value: o.v });
                tapAdvance("pain");
              }}
            />
          ))}
        </div>
      </OnboardingShell>
    );
  }

  /* 3. Pain */
  if (step === "pain") {
    const opts: { v: Pain; label: string; icon: React.ReactNode }[] = [
      { v: "too_expensive", label: "Products are too expensive", icon: <TrendingDown className="h-5 w-5" /> },
      { v: "viral_regret", label: "I buy viral products and regret it", icon: <Flame className="h-5 w-5" /> },
      { v: "cant_tell_similar", label: "I can't tell what's actually similar", icon: <Search className="h-5 w-5" /> },
      { v: "want_swaps", label: "I want cheaper swaps before I buy", icon: <Repeat className="h-5 w-5" /> },
      { v: "waste_money", label: "I waste money trying products", icon: <ShoppingBag className="h-5 w-5" /> },
    ];
    return (
      <OnboardingShell step={progress} total={TOTAL} onBack={goBack("category")}>
        <GuidedLineReveal headline="What usually makes beauty shopping frustrating?">
          <ProductHero src={painImage} alt="A shopper holding a viral product while Dupli surfaces a cheaper match" compact />
        </GuidedLineReveal>
        <div className="mt-5 space-y-2.5">
          {opts.map((o) => (
            <TapCard
              key={o.v}
              icon={o.icon}
              title={o.label}
              active={pain === o.v}
              onClick={() => {
                setPain(o.v);
                tapAdvance("preview_scan");
              }}
            />
          ))}
        </div>
      </OnboardingShell>
    );
  }

  /* 4. Preview: Scan */
  if (step === "preview_scan") {
    return (
      <OnboardingShell
        step={progress}
        total={TOTAL}
        onBack={goBack("pain")}
        primary={{ label: "Show me more", onClick: goNext("preview_results") }}
      >
        <PreviewKicker icon={<ScanLine className="h-3 w-3" />} label="Step 1 · Scan" />
        <GuidedLineReveal
          headline="Scan before you buy."
          lines={["Use Dupli to check a product before you spend money on it."]}
        >
          <PhoneFrame src={previewScanImage} alt="Dupli camera scanning a serum on a store shelf" />
        </GuidedLineReveal>
      </OnboardingShell>
    );
  }

  /* 5. Preview: Results */
  if (step === "preview_results") {
    return (
      <OnboardingShell
        step={progress}
        total={TOTAL}
        onBack={goBack("preview_scan")}
        primary={{ label: "Continue", onClick: goNext("preview_compare") }}
      >
        <PreviewKicker icon={<Sparkles className="h-3 w-3" />} label="Step 2 · Results" />
        <GuidedLineReveal
          headline="See results that actually help."
          lines={["See cheaper alternatives, compare products, and get useful dupe-style results fast."]}
        >
          <PhoneFrame src={previewResultsImage} alt="Dupli result showing a strong match and a 17% cheaper alternative" badge="Save 17%" />
        </GuidedLineReveal>
      </OnboardingShell>
    );
  }

  /* 6. Preview: Compare */
  if (step === "preview_compare") {
    return (
      <OnboardingShell
        step={progress}
        total={TOTAL}
        onBack={goBack("preview_results")}
        primary={{ label: "That's useful", onClick: goNext("commitment") }}
      >
        <PreviewKicker icon={<Layers className="h-3 w-3" />} label="Step 3 · Compare" />
        <GuidedLineReveal
          headline="Compare smarter alternatives."
          lines={["Find what gives you a similar result without paying premium prices."]}
        >
          <ProductHero src={previewCompareImage} alt="Side-by-side comparison of a premium serum and a cheaper dupe" />
        </GuidedLineReveal>
      </OnboardingShell>
    );
  }

  /* 7. Commitment */
  if (step === "commitment") {
    const opts: { v: Commitment; label: string; icon: React.ReactNode }[] = [
      { v: "one_dupe_month", label: "Finding one cheaper dupe a month", icon: <Sparkles className="h-5 w-5" /> },
      { v: "avoid_bad", label: "Avoiding bad purchases", icon: <ShieldCheck className="h-5 w-5" /> },
      { v: "compare_before", label: "Comparing products before buying", icon: <Layers className="h-5 w-5" /> },
      { v: "save_every_shop", label: "Saving money every time I shop", icon: <PiggyBank className="h-5 w-5" /> },
      { v: "smarter_routine", label: "Building a smarter routine", icon: <TrendingDown className="h-5 w-5" /> },
    ];
    return (
      <OnboardingShell step={progress} total={TOTAL} onBack={goBack("preview_compare")}>
        <GuidedLineReveal headline="What would make Dupli worth it for you?" />
        <div className="mt-6 space-y-2.5">
          {opts.map((o) => (
            <TapCard
              key={o.v}
              icon={o.icon}
              title={o.label}
              active={commitment === o.v}
              onClick={() => {
                setCommitment(o.v);
                tapAdvance("building");
              }}
            />
          ))}
        </div>
      </OnboardingShell>
    );
  }

  /* 8. Building */
  if (step === "building") {
    const items = [
      "Learning how you shop for beauty products…",
      "Preparing your scan-first recommendations…",
      "Building your smarter Dupli routine…",
      "Getting your product comparison tools ready…",
    ];
    return (
      <ChecklistLoading
        progress={progress}
        headline="Building your Dupli plan…"
        items={items}
        onDone={goNext("plan_ready")}
      />
    );
  }

  /* 9. Plan ready */
  if (step === "plan_ready") {
    const finishToPaywall = async () => {
      markOnboardingComplete();
      try {
        await saveOnboardingAnswers({
          data: {
            answers: {
              category: categoryChoice,
              pain,
              commitment,
            },
          },
        });
        await completeOnboarding();
      } catch {
        /* non-fatal — paywall will still gate access */
      }
      navigate({ to: "/paywall" });
    };

    return (
      <OnboardingShell
        step={progress}
        total={TOTAL}
        primary={{ label: "Continue", onClick: () => void finishToPaywall() }}
      >
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-foreground">
          <Sparkles className="h-3 w-3" />
          Your plan is ready
        </div>
        <GuidedLineReveal
          headline="Your Dupli plan is ready."
          lines={[
            "Based on how you shop, Dupli can help you scan products, compare alternatives, and save money before you buy.",
          ]}
        >
          <ProductHero src={planReadyImage} alt="Personalized Dupli home with savings and recent dupes" compact />
          <ul className="space-y-1.5">
            {[
              "Scan beauty products before purchasing",
              "See useful comparison-style results",
              "Discover cheaper alternatives faster",
              "Save your results and come back later",
            ].map((line) => (
              <li
                key={line}
                className="flex items-center gap-3 rounded-[14px] border border-border bg-card px-4 py-2.5"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                <span className="text-[13.5px] font-semibold">{line}</span>
              </li>
            ))}
          </ul>
        </GuidedLineReveal>
      </OnboardingShell>
    );
  }

  return null;
}

/* ------------------------------ Sub-components ------------------------------ */

function ProductHero({
  src,
  alt,
  badge,
  compact = false,
}: {
  src: string;
  alt: string;
  badge?: string;
  compact?: boolean;
}) {
  return (
    <div className="relative -mx-2 overflow-hidden rounded-[24px] border border-border bg-muted/40 shadow-soft">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={`block w-full animate-[result-rise_700ms_cubic-bezier(0.2,0.8,0.2,1)_120ms_both] ${
          compact ? "h-[26vh] max-h-[220px] object-cover" : "h-auto"
        }`}
        draggable={false}
      />
      {badge && (
        <div className="absolute right-4 top-4 rounded-full bg-success px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-background shadow-lift animate-[result-pop_500ms_cubic-bezier(0.34,1.7,0.64,1)_500ms_both]">
          {badge}
        </div>
      )}
      <style>{`
        @keyframes result-rise {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes result-pop {
          from { opacity: 0; transform: scale(0.4) rotate(-8deg); }
          to { opacity: 1; transform: scale(1) rotate(0); }
        }
      `}</style>
    </div>
  );
}

function PhoneFrame({
  src,
  alt,
  badge,
}: {
  src: string;
  alt: string;
  badge?: string;
}) {
  return (
    <div className="relative -mx-2 overflow-hidden rounded-[28px] bg-gradient-to-b from-[#FBE9E1] via-[#F5F0E8] to-[#F8E8EE] shadow-lift">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="block h-auto w-full animate-[result-rise_800ms_cubic-bezier(0.2,0.8,0.2,1)_120ms_both]"
        draggable={false}
      />
      {badge && (
        <div className="absolute right-4 top-4 rounded-full bg-success px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-background shadow-lift animate-[result-pop_500ms_cubic-bezier(0.34,1.7,0.64,1)_700ms_both]">
          {badge}
        </div>
      )}
    </div>
  );
}

function PreviewKicker({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-foreground">
      {icon}
      {label}
    </div>
  );
}

function ChecklistLoading({
  progress,
  headline,
  items,
  onDone,
}: {
  progress: number;
  headline: string;
  items: string[];
  onDone: () => void;
}) {
  const [done, setDone] = useState(0);
  useEffect(() => {
    const timeouts: number[] = [];
    items.forEach((_, i) => {
      timeouts.push(window.setTimeout(() => setDone(i + 1), 350 + i * 520));
    });
    timeouts.push(window.setTimeout(onDone, 350 + items.length * 520 + 380));
    return () => timeouts.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <OnboardingShell step={progress} total={TOTAL}>
      <div className="flex h-full flex-col items-center justify-center pt-4 text-center">
        <h1 className="font-display text-[24px] font-bold tracking-tight">{headline}</h1>
        <ul className="mt-8 w-full max-w-xs space-y-3 text-left">
          {items.map((label, i) => {
            const isDone = i < done;
            return (
              <li
                key={label}
                className={`flex items-center gap-3 rounded-[14px] border px-4 py-3 transition-all ${
                  isDone
                    ? "border-success/30 bg-success-soft text-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                    isDone
                      ? "border-success bg-success text-success-foreground"
                      : "border-border bg-background"
                  }`}
                >
                  {isDone ? (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  ) : (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/60" />
                  )}
                </span>
                <span className="text-[14px] font-medium">{label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </OnboardingShell>
  );
}
