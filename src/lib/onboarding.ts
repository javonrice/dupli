// Local-first onboarding state + lightweight analytics shim.
// We persist completion + the user's onboarding answers in localStorage so
// we don't have to add a new DB table for v1. If/when a `user_preferences`
// table exists, swap the read/write helpers.

const KEY = "dupli.onboarding.v1";

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

export type OnboardingState = {
  completed: boolean;
  completedAt?: string;
  frequency?: Frequency;
  categories?: Category[];
  // Whether the user has already used their one "free first real result".
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

/* ------------------------------ Analytics ------------------------------ */

// Placeholder — wired later if/when an analytics provider is added.
// Kept side-effect free (just a console.debug) so it never breaks builds.
export type OnboardingEvent =
  | "onboarding_started"
  | "onboarding_screen_viewed"
  | "onboarding_pain_continue"
  | "onboarding_frequency_selected"
  | "onboarding_categories_selected"
  | "onboarding_sample_selected"
  | "onboarding_scan_selected"
  | "onboarding_upload_selected"
  | "onboarding_manual_selected"
  | "sample_result_viewed"
  | "first_real_scan_started"
  | "first_real_scan_completed"
  | "first_real_scan_failed"
  | "paywall_viewed_after_result"
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
