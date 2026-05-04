import { Star } from "lucide-react";

const TESTIMONIALS = [
  {
    name: "Maya R.",
    quote:
      "Found a $14 dupe for the moisturizer I was about to drop $58 on. Refunded it the same day.",
  },
  {
    name: "Jordan P.",
    quote:
      "Finally an app that doesn't just shout 'EXACT DUPE'. The match breakdowns actually help me decide.",
  },
  {
    name: "Lex S.",
    quote: "Saved me hundreds this year on skincare. Wish I had this in college.",
  },
  {
    name: "Sam K.",
    quote: "I scan everything before checkout now. It's saved me from so many TikTok mistakes.",
  },
];

export function SocialProof() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center">
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="h-5 w-5 fill-warning text-warning" strokeWidth={1.5} />
          ))}
        </div>
        <p className="mt-2 font-display text-[28px] font-bold leading-none tracking-tight">
          4.8 out of 5
        </p>
        <p className="mt-1 text-[12px] uppercase tracking-[0.16em] text-muted-foreground">
          From 12,000+ shoppers
        </p>
      </div>
      <div className="space-y-2.5">
        {TESTIMONIALS.map((t) => (
          <div
            key={t.name}
            className="rounded-[16px] border border-border bg-card p-4 shadow-soft"
          >
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-3 w-3 fill-warning text-warning" strokeWidth={1.5} />
              ))}
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-foreground">"{t.quote}"</p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t.name}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
