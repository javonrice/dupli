// Local-first onboarding state + lightweight analytics shim.
// We persist completion + the user's onboarding answers in localStorage so
// we don't have to add a new DB table for v1.

const KEY = "dupli.onboarding.v1";
const PENDING_EMAIL_KEY = "dupli.onboarding.pending_email";

export function setPendingEmail(email: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_EMAIL_KEY, email.trim().toLowerCase());
  } catch {
    /* ignore */
  }
}
export function getPendingEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(PENDING_EMAIL_KEY);
  } catch {
    return null;
  }
}
export function clearPendingEmail() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    /* ignore */
  }
}

export type Frequency =
  | "few_per_year"
  | "monthly"
  | "few_per_month"
  | "weekly"
  | "always";

export type Category =
  | "skincare"
  | "makeup"
  | "haircare"
  | "body"
  | "viral"
  | "luxury";

export type Gender = "female" | "male" | "other";
export type AgeRange = "under_18" | "18_24" | "25_34" | "35_44" | "45_plus";
export type Goal = "save_money" | "clean_ingredients" | "viral_dupes" | "all";

export type OnboardingState = {
  completed: boolean;
  completedAt?: string;
  gender?: Gender;
  ageRange?: AgeRange;
  frequency?: Frequency;
  categories?: Category[];
  goal?: Goal;
  firstRealResultUsed?: boolean;
};

export function readOnboarding(): OnboardingState {
  if (typeof window === "undefined") return { completed: false };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { completed: false };
    return JSON.parse(raw) as OnboardingState;
  } catch {
    return { completed: false };
  }
}

export function writeOnboarding(patch: Partial<OnboardingState>) {
  if (typeof window === "undefined") return;
  const next = { ...readOnboarding(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export function markOnboardingComplete() {
  writeOnboarding({ completed: true, completedAt: new Date().toISOString() });
}

export function isOnboarded(): boolean {
  return readOnboarding().completed === true;
}

/* --------------------- Personalized savings estimate --------------------- */

const FREQ_MULTIPLIER: Record<Frequency, number> = {
  few_per_year: 60,
  monthly: 180,
  few_per_month: 320,
  weekly: 520,
  always: 760,
};

/** Plausible (not-promised) yearly savings estimate used for the plan reveal. */
export function estimatedYearlySavings(state: OnboardingState): number {
  const base = state.frequency ? FREQ_MULTIPLIER[state.frequency] : 220;
  const cats = state.categories?.length ?? 1;
  const catBoost = 1 + Math.min(cats - 1, 4) * 0.18; // up to ~+72%
  const goalBoost = state.goal === "save_money" || state.goal === "all" ? 1.15 : 1;
  const raw = base * catBoost * goalBoost;
  // Round to nearest $10 for a clean number.
  return Math.max(80, Math.round(raw / 10) * 10);
}

/* ------------------------------ Analytics ------------------------------ */

export type OnboardingEvent =
  | "onboarding_started"
  | "onboarding_screen_viewed"
  | "onboarding_gender_selected"
  | "onboarding_age_selected"
  | "onboarding_frequency_selected"
  | "onboarding_categories_selected"
  | "onboarding_goal_selected"
  | "onboarding_notifications_response"
  | "onboarding_sample_selected"
  | "onboarding_scan_selected"
  | "onboarding_upload_selected"
  | "onboarding_manual_selected"
  | "sample_result_viewed"
  | "first_real_scan_started"
  | "first_real_scan_completed"
  | "first_real_scan_failed"
  | "paywall_viewed_after_result"
  | "paywall_plan_toggled"
  | "trial_started"
  | "paywall_dismissed";

export function track(event: OnboardingEvent, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line no-console
  console.debug("[analytics]", event, props ?? {});
}

/* --------------------------- Reduced motion --------------------------- */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
