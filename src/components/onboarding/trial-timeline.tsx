import { Bell, Sparkles, Wallet } from "lucide-react";

export function TrialTimeline({ price = "$39.99" }: { price?: string }) {
  const steps = [
    {
      icon: <Sparkles className="h-4 w-4" />,
      title: "Today",
      body: "Unlock unlimited scans, full match breakdowns, and saved dupes.",
    },
    {
      icon: <Bell className="h-4 w-4" />,
      title: "Day 5",
      body: "We'll remind you before your trial ends — cancel anytime.",
    },
    {
      icon: <Wallet className="h-4 w-4" />,
      title: "Day 7",
      body: `Your subscription begins (${price}/year). No charge if you cancel first.`,
    },
  ];
  return (
    <ol className="relative space-y-4 pl-9">
      <span className="absolute left-3.5 top-3 bottom-3 w-px bg-border" aria-hidden />
      {steps.map((s) => (
        <li key={s.title} className="relative">
          <span className="absolute -left-[26px] top-0 flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background shadow-soft">
            {s.icon}
          </span>
          <p className="font-display text-[14px] font-bold leading-tight tracking-tight">
            {s.title}
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
