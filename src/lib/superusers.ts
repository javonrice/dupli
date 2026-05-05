// Hardcoded super users — get pro benefits for life, bypass paywall + scan quota.
export const SUPER_USER_IDS = new Set<string>([
  "71fdfb71-f9ac-4649-a598-612f36bf973f",
]);

export function isSuperUser(userId: string | null | undefined): boolean {
  return !!userId && SUPER_USER_IDS.has(userId);
}
