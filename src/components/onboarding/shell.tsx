import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

type Props = {
  step: number; // 1..TOTAL
  total?: number;
  back?: string | null; // path to go back to; null hides
  children: ReactNode;
  cta?: ReactNode; // sticky bottom CTA (button or null)
  bgClass?: string;
};

export const TOTAL_STEPS = 12;

export function OnboardingShell({
  step,
  total = TOTAL_STEPS,
  back,
  children,
  cta,
  bgClass = "bg-background",
}: Props) {
  const navigate = useNavigate();
  const pct = Math.min(100, Math.round((step / total) * 100));

  return (
    <div className={`flex h-screen-safe flex-col ${bgClass}`}>
      <div className="pt-safe" />
      {/* Header: back + progress */}
      <div className="flex items-center gap-3 px-5 pt-3">
        <button
          aria-label="Back"
          onClick={() => (back ? navigate({ to: back }) : window.history.back())}
          className={`tap -ml-1 flex h-9 w-9 items-center justify-center rounded-full ${
            back === null ? "invisible" : ""
          }`}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="absolute inset-y-0 left-0 bg-foreground"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-1 flex-col overflow-y-auto px-6 pt-8"
        >
          {children}
        </motion.div>
      </AnimatePresence>

      {cta && <div className="pb-safe px-6 pt-3 pb-6 space-y-2">{cta}</div>}
    </div>
  );
}

export function PrimaryCTA({
  onClick,
  disabled,
  children,
  pulse,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  pulse?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`tap relative flex h-[56px] w-full items-center justify-center rounded-[16px] bg-foreground text-[16px] font-semibold text-background disabled:opacity-40 ${
        pulse ? "shadow-lift" : ""
      }`}
    >
      {pulse && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-[16px] bg-foreground"
          animate={{ opacity: [0.0, 0.15, 0.0] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="mt-3 font-display text-[32px] font-bold leading-[1.1] tracking-tight">
      {children}
    </h1>
  );
}

export function ScreenSubtitle({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}
