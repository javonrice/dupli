import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Receipt,
  Check,
  Droplets,
  Brush,
  Scissors,
  Hand,
  Flame,
  Crown,
  ShieldCheck,
  AlertTriangle,
  Bell,
  FlaskConical,
  Search,
  User,
  UserRound,
  CircleUser,
  Leaf,
  PiggyBank,
  Star,
} from "lucide-react";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import dupliWordmark from "@/assets/dupli-wordmark.png";
import heroCameraScan from "@/assets/onboarding/hero-camera-scan.jpg";
import heroResultPhone from "@/assets/onboarding/hero-result-phone.jpg";
import { GuidedLineReveal } from "@/components/onboarding/guided-line-reveal";
import { LearningCard } from "@/components/onboarding/learning-card";
import { TapCard } from "@/components/onboarding/tap-card";
import { SocialProof } from "@/components/onboarding/social-proof";
import { PlanReveal } from "@/components/onboarding/plan-reveal";
import {
  markOnboardingComplete,
  readOnboarding,
  track,
  writeOnboarding,
  type AgeRange,
  type Category,
  type Frequency,
  type Gender,
  type Goal,
} from "@/lib/onboarding";
import { useScanFlow } from "@/lib/use-scan-flow";
import { ScanningScreen, ResultsScreen } from "@/components/scanner";
import { LiveCamera } from "@/components/camera/live-camera";
import {
  completeOnboarding,
  saveOnboardingAnswers,
} from "@/server/onboarding.functions";

export const Route = createFileRoute("/onboarding/")({
  component: OnboardingPage,
  validateSearch: (s: Record<string, unknown>): { start?: "quiz" } => {
    return s.start === "quiz" ? { start: "quiz" } : {};
  },
  // Route access rules:
  // - /onboarding (welcome): public for signed-out; signed-in users go through splash.
  // - /onboarding?start=quiz: requires an authenticated user who has NOT yet
  //   completed onboarding. Signed-out → /onboarding (welcome). Already
  //   onboarded → "/" (which routes to /app or /paywall as appropriate).
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
        // Fail open — let the quiz render rather than dead-end the user.
      }
      return;
    }

    if (data.session) {
      throw redirect({ to: "/" });
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

type Step =
  | "welcome"
  | "gender"
  | "age"
  | "frequency"
  | "categories"
  | "goal"
  | "pain"
  | "social_proof"
  | "trust"
  | "building"
  | "plan_reveal"
  | "notifications"
  | "sample_loading"
  | "sample_result";

const ORDER: Step[] = [
  "welcome",
  "gender",
  "age",
  "frequency",
  "categories",
  "goal",
  "pain",
  "social_proof",
  "trust",
  "building",
  "plan_reveal",
  "notifications",
  "sample_loading",
  "sample_result",
];

const TOTAL = ORDER.length - 1; // welcome doesn't show progress

function OnboardingPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [step, setStep] = useState<Step>(
    search.start === "quiz" ? "gender" : "welcome",
  );
  const [gender, setGender] = useState<Gender | undefined>();
  const [ageRange, setAgeRange] = useState<AgeRange | undefined>();
  const [frequency, setFrequency] = useState<Frequency | undefined>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [goal, setGoal] = useState<Goal | undefined>();
  const flow = useScanFlow();

  useEffect(() => {
    track("onboarding_started");
  }, []);
  useEffect(() => {
    track("onboarding_screen_viewed", { step });
  }, [step]);

  // Quiz steps require auth. If we're past welcome and not signed in,
  // redirect to email step. Skip this check when arriving from signup
  // (?start=quiz) — the session may still be hydrating.
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

  // Auto-advance helper for one-tap selection screens.
  const tapAdvance = (next: Step, ms = 220) => {
    window.setTimeout(() => setStep(next), ms);
  };

  // ---------- Real scan path: hand off to existing scan flow components.
  if (flow.cameraOpen) {
    return (
      <LiveCamera
        onCapture={(dataUrl) => {
          track("first_real_scan_started");
          flow.handleCameraCapture(dataUrl);
        }}
        onClose={flow.closeCamera}
      />
    );
  }
  if (flow.stage === "scanning") {
    return (
      <>
        <ScanningScreen preview={flow.preview} />
        <FileInputs flow={flow} />
      </>
    );
  }
  if (flow.stage === "results" && flow.analysis) {
    return (
      <>
        <ResultsScreen
          analysis={flow.analysis}
          preview={flow.preview}
          scanId={flow.scanId}
          isSaved={flow.isSaved}
          canSave={flow.canSave}
          onToggleSave={() => {
            writeOnboarding({ firstRealResultUsed: true });
            navigate({ to: "/paywall" });
          }}
          onReset={() => {
            writeOnboarding({ firstRealResultUsed: true });
            navigate({ to: "/paywall" });
          }}
          onShare={() => {
            writeOnboarding({ firstRealResultUsed: true });
            navigate({ to: "/paywall" });
          }}
          preparingShare={false}
        />
        <FileInputs flow={flow} />
      </>
    );
  }

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
          {/* Immersive hero — camera POV scanning a real product */}
          <div className="relative h-[58vh] min-h-[360px] w-full overflow-hidden">
            <img
              src={heroCameraScan}
              alt="Scanning a beauty product with Dupli"
              className="absolute inset-0 h-full w-full object-cover animate-[hero-zoom_8s_ease-out_forwards]"
              draggable={false}
            />
            {/* Soft fade-out into copy */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
            {/* Live scan pill */}
            <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-foreground/70 px-2.5 py-1 text-[11px] font-semibold text-background backdrop-blur animate-[hero-fade_700ms_ease-out_400ms_both]">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Live scan
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center px-5 pt-2 text-center">
            <img
              src={dupliWordmark}
              alt="Dupli"
              className="h-10 w-auto select-none"
              draggable={false}
            />
            <h1 className="mt-4 max-w-[20rem] font-display text-[26px] font-bold leading-[1.05] tracking-tight">
              Snap a product. Find the dupe.
            </h1>
            <p className="mt-2 max-w-[20rem] text-[14px] leading-relaxed text-muted-foreground">
              Point your camera at any beauty product to find a lower-cost match in seconds.
            </p>
            <div className="mt-4 flex items-center gap-1">
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

  if (step === "gender") {
    const opts: { v: Gender; label: string; icon: React.ReactNode }[] = [
      { v: "female", label: "Female", icon: <UserRound className="h-5 w-5" /> },
      { v: "male", label: "Male", icon: <User className="h-5 w-5" /> },
      { v: "other", label: "Other / Prefer not to say", icon: <CircleUser className="h-5 w-5" /> },
    ];
    return (
      <OnboardingShell step={progress} total={TOTAL} onBack={goBack("welcome")}>
        <GuidedLineReveal headline="Who are we shopping for?" />
        <div className="mt-6 space-y-2.5">
          {opts.map((o) => (
            <TapCard
              key={o.v}
              icon={o.icon}
              title={o.label}
              active={gender === o.v}
              onClick={() => {
                setGender(o.v);
                track("onboarding_gender_selected", { value: o.v });
                tapAdvance("age");
              }}
            />
          ))}
        </div>
      </OnboardingShell>
    );
  }

  if (step === "age") {
    const opts: { v: AgeRange; label: string }[] = [
      { v: "under_18", label: "Under 18" },
      { v: "18_24", label: "18 – 24" },
      { v: "25_34", label: "25 – 34" },
      { v: "35_44", label: "35 – 44" },
      { v: "45_plus", label: "45+" },
    ];
    return (
      <OnboardingShell step={progress} total={TOTAL} onBack={goBack("gender")}>
        <GuidedLineReveal headline="What's your age range?" />
        <div className="mt-6 space-y-2.5">
          {opts.map((o) => (
            <TapCard
              key={o.v}
              title={o.label}
              active={ageRange === o.v}
              onClick={() => {
                setAgeRange(o.v);
                track("onboarding_age_selected", { value: o.v });
                tapAdvance("frequency");
              }}
            />
          ))}
        </div>
      </OnboardingShell>
    );
  }

  if (step === "frequency") {
    const opts: { v: Frequency; label: string; sub: string }[] = [
      { v: "few_per_year", label: "A few times a year", sub: "Occasional restock" },
      { v: "monthly", label: "Monthly", sub: "Steady routine" },
      { v: "few_per_month", label: "A few times a month", sub: "Always trying something new" },
      { v: "weekly", label: "Weekly", sub: "Beauty is the hobby" },
      { v: "always", label: "I'm always shopping", sub: "Cart is never empty" },
    ];
    return (
      <OnboardingShell step={progress} total={TOTAL} onBack={goBack("age")}>
        <GuidedLineReveal headline="How often do you buy beauty?" />
        <div className="mt-6 space-y-2.5">
          {opts.map((o) => (
            <TapCard
              key={o.v}
              title={o.label}
              subtitle={o.sub}
              active={frequency === o.v}
              onClick={() => {
                setFrequency(o.v);
                track("onboarding_frequency_selected", { value: o.v });
                tapAdvance("categories");
              }}
            />
          ))}
        </div>
      </OnboardingShell>
    );
  }

  if (step === "categories") {
    const opts: { v: Category; label: string; icon: React.ReactNode }[] = [
      { v: "skincare", label: "Skincare", icon: <Droplets className="h-5 w-5" /> },
      { v: "makeup", label: "Makeup", icon: <Brush className="h-5 w-5" /> },
      { v: "haircare", label: "Haircare", icon: <Scissors className="h-5 w-5" /> },
      { v: "body", label: "Body care", icon: <Hand className="h-5 w-5" /> },
      { v: "viral", label: "Viral picks", icon: <Flame className="h-5 w-5" /> },
      { v: "luxury", label: "Luxury beauty", icon: <Crown className="h-5 w-5" /> },
    ];
    const toggle = (v: Category) => {
      setCategories((prev) =>
        prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
      );
    };
    return (
      <OnboardingShell
        step={progress}
        total={TOTAL}
        onBack={goBack("frequency")}
        primary={{
          label: categories.length ? "Continue" : "Pick at least one",
          disabled: categories.length === 0,
          onClick: () => {
            track("onboarding_categories_selected", { categories });
            setStep("goal");
          },
        }}
      >
        <GuidedLineReveal headline="What do you want to save on?" lines={["Pick all that apply."]} />
        <div className="mt-6 grid grid-cols-2 gap-2.5">
          {opts.map((o) => {
            const active = categories.includes(o.v);
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => toggle(o.v)}
                className={`tap flex aspect-[1.5] w-full flex-col items-start justify-between rounded-[18px] border p-4 text-left transition-all active:scale-[0.985] ${
                  active
                    ? "border-foreground bg-foreground text-background shadow-lift"
                    : "border-border bg-card text-foreground hover:border-foreground/40"
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${
                    active ? "bg-background/15 text-background" : "bg-foreground/5 text-foreground"
                  }`}
                >
                  {o.icon}
                </span>
                <div className="flex w-full items-center justify-between">
                  <span className="text-[15px] font-semibold">{o.label}</span>
                  {active && <Check className="h-4 w-4" strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>
      </OnboardingShell>
    );
  }

  if (step === "goal") {
    const opts: { v: Goal; label: string; sub: string; icon: React.ReactNode }[] = [
      {
        v: "save_money",
        label: "Save money",
        sub: "Find cheaper alternatives before checkout.",
        icon: <PiggyBank className="h-5 w-5" />,
      },
      {
        v: "clean_ingredients",
        label: "Cleaner ingredients",
        sub: "Compare formulas, not just claims.",
        icon: <Leaf className="h-5 w-5" />,
      },
      {
        v: "viral_dupes",
        label: "Match viral products",
        sub: "Compare to the products everyone is hyping.",
        icon: <Flame className="h-5 w-5" />,
      },
      {
        v: "all",
        label: "All of the above",
        sub: "Give me everything Dupli can do.",
        icon: <Sparkles className="h-5 w-5" />,
      },
    ];
    return (
      <OnboardingShell step={progress} total={TOTAL} onBack={goBack("categories")}>
        <GuidedLineReveal headline="What matters most to you?" />
        <div className="mt-6 space-y-2.5">
          {opts.map((o) => (
            <TapCard
              key={o.v}
              icon={o.icon}
              title={o.label}
              subtitle={o.sub}
              active={goal === o.v}
              onClick={() => {
                setGoal(o.v);
                track("onboarding_goal_selected", { value: o.v });
                tapAdvance("pain");
              }}
            />
          ))}
        </div>
      </OnboardingShell>
    );
  }

  if (step === "pain") {
    return (
      <OnboardingShell
        step={progress}
        total={TOTAL}
        onBack={goBack("goal")}
        primary={{ label: "Show me the proof", onClick: goNext("social_proof") }}
      >
        <GuidedLineReveal
          headline={
            <>
              Beauty shoppers overpay <span className="italic">a lot.</span>
            </>
          }
          lines={["~$1,400/yr — much of it has cheaper alternatives."]}
        >
          <ReceiptCard />
        </GuidedLineReveal>
      </OnboardingShell>
    );
  }

  if (step === "social_proof") {
    return (
      <OnboardingShell
        step={progress}
        total={TOTAL}
        onBack={goBack("pain")}
        primary={{ label: "Continue", onClick: goNext("trust") }}
      >
        <SocialProof />
      </OnboardingShell>
    );
  }

  if (step === "trust") {
    return (
      <OnboardingShell
        step={progress}
        total={TOTAL}
        onBack={goBack("social_proof")}
        primary={{ label: "Build my scanner", onClick: goNext("building") }}
      >
        <GuidedLineReveal
          headline="Not every dupe is a real dupe."
          lines={["We compare ingredients, not just packaging."]}
        >
          <LearningCard
            tone="success"
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Strong · Good · Possible"
            body='Honest match scoring — never "exact dupe."'
          />
        </GuidedLineReveal>
      </OnboardingShell>
    );
  }

  if (step === "building") {
    const items = [
      categories.length
        ? `Indexing ${categories.length} categor${categories.length === 1 ? "y" : "ies"}…`
        : "Indexing your beauty mix…",
      frequency
        ? `Tuning for ${freqLabel(frequency)} shoppers…`
        : "Tuning your match scoring…",
      "Calibrating Strong / Good / Possible matches…",
      "Loading a sample dupe for you to preview…",
    ];
    return (
      <ChecklistLoading
        progress={progress}
        headline="Building your scanner…"
        items={items}
        onDone={goNext("plan_reveal")}
      />
    );
  }

  if (step === "plan_reveal") {
    const state = { ...readOnboarding(), gender, ageRange, frequency, categories, goal };
    // Persist now so the user's plan is remembered if they bail.
    writeOnboarding({ gender, ageRange, frequency, categories, goal });
    return (
      <OnboardingShell
        step={progress}
        total={TOTAL}
        onBack={goBack("trust")}
        primary={{ label: "See my first match", onClick: goNext("notifications") }}
      >
        <PlanReveal state={state} />
      </OnboardingShell>
    );
  }

  if (step === "notifications") {
    return (
      <OnboardingShell
        step={progress}
        total={TOTAL}
        onBack={goBack("plan_reveal")}
        primary={{
          label: "Allow notifications",
          onClick: () => {
            track("onboarding_notifications_response", { allow: true });
            setStep("sample_loading");
          },
        }}
        textLink={{
          label: "Maybe later",
          onClick: () => {
            track("onboarding_notifications_response", { allow: false });
            setStep("sample_loading");
          },
        }}
      >
        <div className="flex flex-col items-center pt-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background shadow-lift">
            <Bell className="h-6 w-6" />
          </div>
          <h1 className="mt-5 font-display text-[26px] font-bold leading-tight tracking-tight">
            Get notified when we find a match.
          </h1>
          <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
            We'll ping you when a stronger or cheaper dupe shows up for products you've scanned.
          </p>
        </div>
      </OnboardingShell>
    );
  }

  if (step === "sample_loading") {
    return (
      <ChecklistLoading
        progress={progress}
        headline="Finding your first match…"
        items={[
          "Reading a sample product",
          "Identifying product type and purpose",
          "Comparing ingredients",
          "Scoring lower-cost alternatives",
        ]}
        onDone={() => {
          track("sample_result_viewed");
          setStep("sample_result");
        }}
      />
    );
  }

  if (step === "sample_result") {
    const finishToPaywall = async () => {
      markOnboardingComplete();
      try {
        await saveOnboardingAnswers({
          data: {
            answers: { gender, ageRange, frequency, categories, goal },
          },
        });
        await completeOnboarding();
      } catch {
        /* non-fatal — paywall will still gate access */
      }
      navigate({ to: "/paywall" });
    };
    return (
      <SampleResultScreen
        progress={progress}
        onScanOwn={() => {
          track("onboarding_scan_selected");
          void finishToPaywall();
        }}
        onSeeFull={() => {
          void finishToPaywall();
        }}
      />
    );
  }

  return null;
}

/* ------------------------------ Sub-components ------------------------------ */

function freqLabel(f: Frequency): string {
  switch (f) {
    case "few_per_year":
      return "occasional";
    case "monthly":
      return "monthly";
    case "few_per_month":
      return "frequent";
    case "weekly":
      return "weekly";
    case "always":
      return "always-on";
  }
}

function FileInputs({ flow }: { flow: ReturnType<typeof useScanFlow> }) {
  return (
    <input
      ref={flow.libraryRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        if (e.target.files?.[0]) {
          track("first_real_scan_started");
          flow.handleFile(e.target.files[0]);
        }
      }}
    />
  );
}

function ReceiptCard() {
  const items: [string, number][] = [
    ["Serum", 48],
    ["Moisturizer", 38],
    ["Cleanser", 29],
  ];
  const total = items.reduce((s, [, v]) => s + v, 0);
  const [revealed, setRevealed] = useState(0);
  const [showTotal, setShowTotal] = useState(false);
  const [counter, setCounter] = useState(0);

  // Stagger the line items in, then slam the total.
  useEffect(() => {
    const timeouts: number[] = [];
    items.forEach((_, i) => {
      timeouts.push(window.setTimeout(() => setRevealed(i + 1), 350 + i * 450));
    });
    timeouts.push(
      window.setTimeout(() => setShowTotal(true), 350 + items.length * 450 + 250),
    );
    return () => timeouts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Count up the total once it slams in.
  useEffect(() => {
    if (!showTotal) return;
    const start = performance.now();
    const duration = 600;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setCounter(Math.round(eased * total));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [showTotal, total]);

  return (
    <div className="rounded-[20px] border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 text-muted-foreground" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Beauty haul
        </p>
      </div>
      <div className="mt-3 space-y-2">
        {items.map(([k, v], i) => (
          <div
            key={k}
            className="flex items-baseline justify-between border-b border-dashed border-border/60 pb-1.5 text-[15px] transition-all duration-500 ease-out"
            style={{
              opacity: i < revealed ? 1 : 0,
              transform: i < revealed ? "translateX(0)" : "translateX(-12px)",
            }}
          >
            <span className="text-foreground">{k}</span>
            <span className="font-mono font-medium text-foreground">${v}</span>
          </div>
        ))}
        <div
          className="flex items-baseline justify-between pt-2 text-[18px] font-bold"
          style={{
            opacity: showTotal ? 1 : 0,
            transform: showTotal ? "scale(1)" : "scale(1.6)",
            transition:
              "opacity 180ms ease-out, transform 260ms cubic-bezier(0.34, 1.8, 0.64, 1)",
          }}
        >
          <span>Total</span>
          <span className="font-mono tabular-nums text-destructive">
            ${counter}
          </span>
        </div>
      </div>
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
      timeouts.push(window.setTimeout(() => setDone(i + 1), 350 + i * 420));
    });
    timeouts.push(window.setTimeout(onDone, 350 + items.length * 420 + 280));
    return () => timeouts.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <OnboardingShell step={progress} total={TOTAL}>
      <div className="flex h-full flex-col items-center justify-center pt-8 text-center">
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

function SampleResultScreen({
  progress,
  onScanOwn,
  onSeeFull,
}: {
  progress: number;
  onScanOwn: () => void;
  onSeeFull: () => void;
}) {
  return (
    <OnboardingShell
      step={progress}
      total={TOTAL}
      primary={{ label: "Unlock full comparison", onClick: onSeeFull }}
      secondary={{ label: "Scan my own product", onClick: onScanOwn }}
    >
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-warning-foreground">
        <Sparkles className="h-3 w-3" />
        Sample result
      </div>
      <GuidedLineReveal headline="Here's what a real result looks like.">
        {/* Phone hero — actual app screenshot framed in a device */}
        <div className="relative -mx-2 overflow-hidden rounded-[24px] bg-[#F5F0E8]">
          <img
            src={heroResultPhone}
            alt="Dupli result on iPhone showing a 17% cheaper match"
            className="h-auto w-full object-contain animate-[result-rise_900ms_cubic-bezier(0.2,0.8,0.2,1)_120ms_both]"
            draggable={false}
          />
          {/* Floating savings tag */}
          <div className="absolute right-4 top-4 rounded-full bg-success px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-background shadow-lift animate-[result-pop_500ms_cubic-bezier(0.34,1.7,0.64,1)_700ms_both]">
            Save 17%
          </div>
        </div>
        <div className="rounded-full border border-success/30 bg-success-soft px-3 py-1.5 text-center text-[12px] font-semibold text-foreground">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-success align-middle" />
          Strong Match · 85% ingredient overlap
        </div>
        <div className="rounded-[18px] border border-border bg-card p-4 shadow-soft">
          <p className="font-display text-[14px] font-bold tracking-tight">Why it matched</p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-muted-foreground">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Same product type and use case
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Shared key active ingredients
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> Risk: comparable — verify before buying
            </li>
          </ul>
        </div>
      </GuidedLineReveal>
      <style>{`
        @keyframes result-rise {
          from { opacity: 0; transform: translateY(28px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes result-pop {
          from { opacity: 0; transform: scale(0.4) rotate(-8deg); }
          to { opacity: 1; transform: scale(1) rotate(0); }
        }
      `}</style>
    </OnboardingShell>
  );
}

function MiniProduct({
  label,
  brand,
  name,
  price,
  highlight,
}: {
  label: string;
  brand: string;
  name: string;
  price: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[16px] border ${highlight ? "border-foreground" : "border-border"} bg-card shadow-soft`}
    >
      <div className="flex aspect-square items-center justify-center bg-gradient-to-br from-accent to-secondary">
        {highlight ? (
          <Sparkles className="h-8 w-8 text-foreground/70" strokeWidth={1.5} />
        ) : (
          <FlaskConical className="h-8 w-8 text-foreground/70" strokeWidth={1.5} />
        )}
      </div>
      <div className="p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">{brand}</p>
        <p className="font-display text-[13px] font-bold leading-tight">{name}</p>
        <p className="mt-1 text-[12px] font-semibold">{price}</p>
      </div>
    </div>
  );
}

// Silence unused warnings if tree-shaken.
export const _icons = { Search };
