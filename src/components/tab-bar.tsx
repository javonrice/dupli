import { Link, useLocation } from "@tanstack/react-router";
import { Camera, Clock, Bookmark, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTabBarHidden } from "@/lib/tab-bar-visibility";

type Tab = {
  to: "/" | "/history" | "/saved" | "/profile";
  label: string;
  icon: LucideIcon;
};

const TABS: Tab[] = [
  { to: "/", label: "Scan", icon: Camera },
  { to: "/history", label: "History", icon: Clock },
  { to: "/saved", label: "Saved", icon: Bookmark },
  { to: "/profile", label: "Profile", icon: User },
];

export function TabBar() {
  const { pathname } = useLocation();

  return (
    <nav className="pb-safe hairline-t fixed inset-x-0 bottom-0 z-40 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pt-1.5">
        {TABS.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className="tap flex min-w-[60px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5"
              aria-label={label}
            >
              <Icon
                className={
                  active
                    ? "h-[26px] w-[26px] text-foreground"
                    : "h-[26px] w-[26px] text-muted-foreground/70"
                }
                strokeWidth={active ? 2.25 : 1.75}
              />
              <span
                className={
                  active
                    ? "text-[10px] font-semibold text-foreground"
                    : "text-[10px] font-medium text-muted-foreground/70"
                }
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Spacer so content above the fixed tab bar isn't covered. */
export function TabBarSpacer() {
  return <div style={{ height: "var(--tab-bar-h)" }} aria-hidden />;
}
