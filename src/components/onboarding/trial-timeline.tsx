import { Bell, Sparkles, Wallet } from "lucide-react";

export function TrialTimeline({
  price = "$39.99",
  cadence = "year",
}: {
  price?: string;
  cadence?: "year" | "month";
}) {
  const steps = [
    {
      icon: <Sparkles className="h-3.5 w-3.5" />,
      title: "Today",
      body: "Unlock unlimited scans and full match breakdowns.",
    },
    {
      icon: <Bell className="h-3.5 w-3.5" />,
      title: "Day 5",
      body: "Reminder before your trial ends — cancel anytime.",
    },
    {
      icon: <Wallet className="h-3.5 w-3.5" />,
      title: "Day 7",
      body: `Trial ends. ${price}/${cadence} unless you cancel.`,
    },
  ];
  return (
    <ol className="relative space-y-3.5">
      <span
        className="absolute left-[13px] top-3 bottom-3 w-px bg-border"
        aria-hidden
      />
      {steps.map((s) => (
        <li key={s.title} className="relative flex items-start gap-3">
          <span className="relative z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-soft ring-4 ring-background">
            {s.icon}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="font-display text-[14px] font-bold leading-tight tracking-tight">
              {s.title}
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
              {s.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
