import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  Image as ImageIcon,
  Pencil,
  Sparkles,
  Receipt,
  Search,
  FlaskConical,
  Check,
  Droplets,
  Brush,
  Scissors,
  Hand,
  Flame,
  Crown,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { GuidedLineReveal } from "@/components/onboarding/guided-line-reveal";
import { LearningCard } from "@/components/onboarding/learning-card";
import {
  markOnboardingComplete,
  track,
  writeOnboarding,
  type Category,
  type Frequency,
} from "@/lib/onboarding";
import { useScanFlow } from "@/lib/use-scan-flow";
import { ScanningScreen, ResultsScreen } from "@/components/scanner";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
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
  | "pain"
  | "trust_gap"
  | "frequency"
  | "categories"
  | "match_quality"
  | "activation"
  | "sample_intro"
  | "sample_loading"
  | "sample_result";

const TOTAL = 7; // visible progress steps (sample loading/result count under "activation")

function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("pain");
  const [frequency, setFrequency] = useState<Frequency | undefined>();
  const [categories, setCategories] = useState<Category[]>([]);
  const flow = useScanFlow();

  useEffect(() => {
    track("onboarding_started");
  }, []);
  useEffect(() => {
    track("onboarding_screen_viewed", { step });
  }, [step]);

  const progress = useMemo(() => {
    const map: Record<Step, number> = {
      pain: 1,
      trust_gap: 2,
      frequency: 3,
      categories: 4,
      match_quality: 5,
      activation: 6,
      sample_intro: 6,
      sample_loading: 7,
      sample_result: 7,
    };
    return map[step];
  }, [step]);

  const finishAndGo = (to: "/app" | "/login") => {
    writeOnboarding({ frequency, categories });
    markOnboardingComplete();
    navigate({ to });
  };

  // Real scan path: hand off to existing scan flow components.
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
            markOnboardingComplete();
            navigate({ to: "/paywall" });
          }}
          onReset={() => {
            writeOnboarding({ firstRealResultUsed: true });
            markOnboardingComplete();
            navigate({ to: "/paywall" });
          }}
          onShare={() => {
            writeOnboarding({ firstRealResultUsed: true });
            markOnboardingComplete();
            navigate({ to: "/paywall" });
          }}
          preparingShare={false}
        />
        <FileInputs flow={flow} />
      </>
    );
  }

  // ------------------------------ Step rendering ------------------------------

  if (step === "pain") {
    return (
      <OnboardingShell
        step={progress}
        total={TOTAL}
        primary={{
          label: "Continue",
          onClick: () => {
            track("onboarding_pain_continue");
            setStep("trust_gap");
          },
        }}
      >
        <GuidedLineReveal
          headline={
            <>
              Beauty products are getting <span className="italic">expensive.</span>
            </>
          }
          lines={[
            "That $48 serum, $38 moisturizer, or $29 cleanser might not be your only option.",
            "Dupli helps you compare lower-cost alternatives before you overpay.",
          ]}
        >
          <ReceiptCard />
          <LearningCard
            tone="success"
            icon={<Sparkles className="h-4 w-4" />}
            title="There may be cheaper alternatives worth comparing."
          />
        </GuidedLineReveal>
      </OnboardingShell>
    );
  }

  if (step === "trust_gap") {
    return (
      <OnboardingShell
        step={progress}
        total={TOTAL}
        onBack={() => setStep("pain")}
        primary={{ label: "Show me better matches", onClick: () => setStep("frequency") }}
      >
        <GuidedLineReveal
          headline="The internet calls everything a dupe."
          lines={[
            "Some products only look similar online.",
            "Packaging is not enough.",
            "Dupli compares product type, purpose, ingredients, and available product details before you trust the match.",
          ]}
        >
          <LearningCard
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Looks similar"
            body="Not enough — packaging can mislead."
          />
          <LearningCard
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Same viral claim"
            body="Not enough — hype isn't a formula."
            className="mt-2"
          />
          <LearningCard
            tone="success"
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Similar purpose + ingredients"
            body="Better signal — that's what Dupli looks for."
            className="mt-2"
          />
        </GuidedLineReveal>
      </OnboardingShell>
    );
  }

  if (step === "frequency") {
    return (
      <FrequencyScreen
        progress={progress}
        value={frequency}
        onChange={(v) => {
          setFrequency(v);
          track("onboarding_frequency_selected", { value: v });
        }}
        onBack={() => setStep("trust_gap")}
        onContinue={() => setStep("categories")}
      />
    );
  }

  if (step === "categories") {
    return (
      <CategoriesScreen
        progress={progress}
        selected={categories}
        onChange={(next) => {
          setCategories(next);
        }}
        onBack={() => setStep("frequency")}
        onContinue={() => {
          track("onboarding_categories_selected", { categories });
          setStep("match_quality");
        }}
      />
    );
  }

  if (step === "match_quality") {
    return (
      <OnboardingShell
        step={progress}
        total={TOTAL}
        onBack={() => setStep("categories")}
        primary={{ label: "Start scanning", onClick: () => setStep("activation") }}
      >
        <GuidedLineReveal
          headline="Dupli does not call everything a dupe."
          lines={[
            "Matches are ranked so you know what is worth comparing.",
            "Some matches are strong. Some are good. Some are only possible.",
          ]}
        >
          <LearningCard
            tone="success"
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Strong Match"
            body="High similarity across product type, purpose, and ingredients."
          />
          <LearningCard
            icon={<Check className="h-4 w-4" />}
            title="Good Match"
            body="Similar use case with meaningful overlap."
            className="mt-2"
          />
          <LearningCard
            tone="muted"
            icon={<Search className="h-4 w-4" />}
            title="Possible Match"
            body="Worth checking, but not identical."
            className="mt-2"
          />
          <p className="mt-4 text-center text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            No fake "exact dupe" claims.
          </p>
        </GuidedLineReveal>
      </OnboardingShell>
    );
  }

  if (step === "activation") {
    return (
      <OnboardingShell
        step={progress}
        total={TOTAL}
        onBack={() => setStep("match_quality")}
        primary={{
          label: "Scan my product",
          onClick: () => {
            track("onboarding_scan_selected");
            flow.openCamera();
          },
        }}
        secondary={{
          label: "Try a sample product",
          onClick: () => {
            track("onboarding_sample_selected");
            setStep("sample_intro");
          },
        }}
        tertiary={{
          label: "Upload a screenshot",
          onClick: () => {
            track("onboarding_upload_selected");
            flow.openLibrary();
          },
        }}
        textLink={{
          label: "Enter product manually",
          onClick: () => {
            track("onboarding_manual_selected");
            // No manual entry route exists yet — finish onboarding and route to /app.
            finishAndGo("/app");
          },
        }}
      >
        <GuidedLineReveal
          headline="Scan a product to find a cheaper match."
          lines={[
            "Use a product from your shelf, in-store, or from a screenshot.",
            "No product nearby? Try Dupli with a sample product first.",
          ]}
        />
        <FileInputs flow={flow} />
      </OnboardingShell>
    );
  }

  if (step === "sample_intro") {
    return (
      <OnboardingShell
        step={progress}
        total={TOTAL}
        onBack={() => setStep("activation")}
        primary={{
          label: "Find cheaper matches",
          onClick: () => setStep("sample_loading"),
        }}
        secondary={{
          label: "Use my own product instead",
          onClick: () => setStep("activation"),
        }}
      >
        <GuidedLineReveal
          headline="Try Dupli with a popular beauty product."
          lines={[
            "We'll show you how Dupli compares a higher-priced beauty product with a lower-cost alternative.",
          ]}
        >
          <SampleProductCard />
        </GuidedLineReveal>
      </OnboardingShell>
    );
  }

  if (step === "sample_loading") {
    return (
      <ChecklistLoading
        progress={progress}
        headline="Finding lower-cost matches…"
        items={[
          "Reading product details",
          "Identifying product type",
          "Comparing ingredients and purpose",
          "Checking possible alternatives",
        ]}
        onDone={() => {
          track("sample_result_viewed");
          setStep("sample_result");
        }}
      />
    );
  }

  if (step === "sample_result") {
    return (
      <SampleResultScreen
        progress={progress}
        onScanOwn={() => {
          markOnboardingComplete();
          flow.openCamera();
        }}
        onSeeFull={() => {
          markOnboardingComplete();
          navigate({ to: "/paywall" });
        }}
      />
    );
  }

  return null;
}

/* ------------------------------ Sub-components ------------------------------ */

function FileInputs({ flow }: { flow: ReturnType<typeof useScanFlow> }) {
  return (
    <>
      <input
        ref={flow.cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            track("first_real_scan_started");
            flow.handleFile(e.target.files[0]);
          }
        }}
      />
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
    </>
  );
}

function ReceiptCard() {
  const items = [
    ["Serum", "$48"],
    ["Moisturizer", "$38"],
    ["Cleanser", "$29"],
  ];
  return (
    <div className="rounded-[20px] border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 text-muted-foreground" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Beauty haul
        </p>
      </div>
      <div className="mt-3 space-y-2">
        {items.map(([k, v]) => (
          <div
            key={k}
            className="flex items-baseline justify-between border-b border-dashed border-border/60 pb-1.5 text-[15px]"
          >
            <span className="text-foreground">{k}</span>
            <span className="font-mono font-medium text-foreground">{v}</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between pt-1.5 text-[16px] font-semibold">
          <span>Total</span>
          <span className="font-mono">$115</span>
        </div>
      </div>
    </div>
  );
}

function FrequencyScreen({
  progress,
  value,
  onChange,
  onBack,
  onContinue,
}: {
  progress: number;
  value?: Frequency;
  onChange: (v: Frequency) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const opts: { v: Frequency; label: string; line: string }[] = [
    {
      v: "few_per_year",
      label: "A few times a year",
      line: "Even a few smarter swaps can make your beauty spend go further.",
    },
    {
      v: "monthly",
      label: "Monthly",
      line: "Even one smarter swap a month can add up.",
    },
    {
      v: "few_per_month",
      label: "A few times a month",
      line: "A few better swaps could change your beauty budget.",
    },
    {
      v: "weekly",
      label: "Weekly",
      line: "You may have the most to save by comparing before you buy.",
    },
    {
      v: "always",
      label: "I'm always shopping",
      line: "Dupli was built for shoppers who love beauty but hate overpaying.",
    },
  ];
  const dynamicLine = opts.find((o) => o.v === value)?.line;

  return (
    <OnboardingShell
      step={progress}
      total={TOTAL}
      onBack={onBack}
      primary={{ label: "Continue", onClick: onContinue, disabled: !value }}
    >
      <GuidedLineReveal headline="How often do you buy beauty products?" />
      <div className="mt-6 space-y-2">
        {opts.map((o, i) => {
          const active = value === o.v;
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => onChange(o.v)}
              style={{ animationDelay: `${120 + i * 60}ms` }}
              className={`tap flex w-full animate-[fade-in_0.35s_ease-out_both] items-center justify-between rounded-[16px] border px-4 py-4 text-left text-[15px] font-semibold transition-colors ${
                active
                  ? "border-foreground bg-foreground text-background shadow-lift"
                  : "border-border bg-card text-foreground"
              }`}
            >
              <span>{o.label}</span>
              {active && <Check className="h-5 w-5" strokeWidth={2.5} />}
            </button>
          );
        })}
      </div>
      {dynamicLine && (
        <div
          key={value}
          className="mt-5 animate-[fade-in_0.4s_ease-out_both] rounded-[14px] border border-border bg-card px-4 py-3 text-[13px] leading-relaxed text-muted-foreground"
        >
          {dynamicLine}
        </div>
      )}
    </OnboardingShell>
  );
}

function CategoriesScreen({
  progress,
  selected,
  onChange,
  onBack,
  onContinue,
}: {
  progress: number;
  selected: Category[];
  onChange: (next: Category[]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [building, setBuilding] = useState(false);
  const opts: { v: Category; label: string; icon: React.ReactNode }[] = [
    { v: "skincare", label: "Skincare", icon: <Droplets className="h-5 w-5" /> },
    { v: "makeup", label: "Makeup", icon: <Brush className="h-5 w-5" /> },
    { v: "haircare", label: "Haircare", icon: <Scissors className="h-5 w-5" /> },
    { v: "body", label: "Body care", icon: <Hand className="h-5 w-5" /> },
    { v: "viral", label: "Viral products", icon: <Flame className="h-5 w-5" /> },
    { v: "luxury", label: "Luxury beauty", icon: <Crown className="h-5 w-5" /> },
  ];
  const toggle = (v: Category) => {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };

  if (building) {
    return (
      <ChecklistLoading
        progress={progress}
        headline="Building your scanner…"
        items={[
          "Personalizing your categories",
          "Preparing product comparison",
          "Unlocking your first scan",
        ]}
        onDone={onContinue}
      />
    );
  }

  return (
    <OnboardingShell
      step={progress}
      total={TOTAL}
      onBack={onBack}
      primary={{
        label: "Build my scanner",
        onClick: () => setBuilding(true),
        disabled: selected.length === 0,
      }}
    >
      <GuidedLineReveal headline="What do you want to save on most?" />
      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {opts.map((o, i) => {
          const active = selected.includes(o.v);
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => toggle(o.v)}
              style={{ animationDelay: `${120 + i * 50}ms` }}
              className={`tap flex aspect-[1.6] w-full animate-[fade-in_0.35s_ease-out_both] flex-col items-start justify-between rounded-[18px] border p-4 text-left transition-colors ${
                active
                  ? "border-foreground bg-foreground text-background shadow-lift"
                  : "border-border bg-card text-foreground"
              }`}
            >
              <span>{o.icon}</span>
              <span className="text-[15px] font-semibold">{o.label}</span>
            </button>
          );
        })}
      </div>
    </OnboardingShell>
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
      timeouts.push(window.setTimeout(() => setDone(i + 1), 450 + i * 500));
    });
    timeouts.push(window.setTimeout(onDone, 450 + items.length * 500 + 350));
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

function SampleProductCard() {
  return (
    <div className="overflow-hidden rounded-[22px] border border-border bg-card shadow-soft">
      <div className="flex aspect-[1.7] items-center justify-center bg-gradient-to-br from-accent via-secondary to-card">
        <FlaskConical className="h-14 w-14 text-foreground/70" strokeWidth={1.5} />
      </div>
      <div className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Premium Skincare
        </p>
        <p className="mt-1 font-display text-[18px] font-bold leading-tight tracking-tight">
          Crème Hydratante Riche
        </p>
        <p className="text-[13px] text-muted-foreground">Maison Lumière · Moisturizer</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground">
            Typical $58–$68
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Sample
          </span>
        </div>
      </div>
    </div>
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
      primary={{ label: "Scan your own product", onClick: onScanOwn }}
      secondary={{ label: "See full comparison", onClick: onSeeFull }}
    >
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-warning-foreground">
        <Sparkles className="h-3 w-3" />
        Sample result
      </div>
      <GuidedLineReveal
        headline="Here's the closest lower-cost match we found."
        lines={[]}
      >
        <div className="grid grid-cols-2 gap-3">
          <MiniProduct
            label="Original"
            brand="Maison Lumière"
            name="Crème Hydratante Riche"
            price="$58–$68"
          />
          <MiniProduct
            label="Match"
            brand="Everyday Glow"
            name="Rich Hydrating Cream"
            price="$14–$18"
            highlight
          />
        </div>
        <div className="rounded-full border border-success/30 bg-success-soft px-3 py-1.5 text-center text-[12px] font-semibold text-foreground">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-success align-middle" />
          Strong Match · 86% confidence
        </div>
        <div className="rounded-[18px] border border-border bg-card p-4 shadow-soft">
          <p className="font-display text-[14px] font-bold tracking-tight">Why it matched</p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-muted-foreground">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Similar product type
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Similar use case
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Shared key ingredients
              and ingredient roles
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> Price check
              needed — lower-cost status not verified yet
            </li>
          </ul>
        </div>
      </GuidedLineReveal>
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

// Dummy export to silence the unused-import warning if these get tree-shaken.
export const _icons = { Camera, ImageIcon, Pencil };
