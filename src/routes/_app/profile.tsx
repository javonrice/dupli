import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  ChevronRight,
  Bell,
  Palette,
  Shield,
  HelpCircle,
  LogOut,
} from "lucide-react";
import { getMyProfile, type ProfileRow } from "@/server/profile.functions";
import { TabBarSpacer } from "@/components/tab-bar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
  head: () => ({
    meta: [
      { title: "Profile — Dupli" },
      { name: "description", content: "Your Dupli profile." },
    ],
  }),
});

function ProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const getProfile = useServerFn(getMyProfile);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [counts, setCounts] = useState<{ scans: number; saved: number }>({
    scans: 0,
    saved: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProfile({})
      .then((r) => {
        setProfile(r.profile);
        setCounts(r.counts);
      })
      .finally(() => setLoading(false));
  }, [getProfile]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const displayName =
    profile?.display_name ??
    user?.user_metadata?.full_name ??
    user?.email?.split("@")[0] ??
    "You";
  const avatar = profile?.avatar_url ?? (user?.user_metadata?.avatar_url as string | undefined);
  const email = profile?.email ?? user?.email ?? "";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen-safe flex-col bg-background">
      <div className="pt-safe sticky top-0 z-30 bg-background/85 backdrop-blur-xl">
        <div className="hairline-b px-5 pb-3 pt-3">
          <h1 className="font-display text-[28px] font-bold tracking-tight">Profile</h1>
        </div>
      </div>

      <div className="flex-1 px-4 pt-4">
        {loading ? (
          <div className="flex justify-center pt-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Identity card */}
            <div className="flex items-center gap-4 rounded-[20px] border border-border bg-card p-4 shadow-soft">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-[22px] font-bold text-foreground">
                {avatar ? (
                  <img
                    src={avatar}
                    alt={displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initial
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[18px] font-semibold leading-tight">
                  {displayName}
                </p>
                <p className="truncate text-[13px] text-muted-foreground">{email}</p>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <StatCard label="Scans" value={counts.scans} />
              <StatCard label="Saved" value={counts.saved} />
            </div>

            {/* Settings group */}
            <SectionLabel>Settings</SectionLabel>
            <SettingsGroup>
              <Row icon={Bell} label="Notifications" />
              <Row icon={Palette} label="Appearance" />
              <Row icon={Shield} label="Privacy & data" />
              <Row icon={HelpCircle} label="Help & support" last />
            </SettingsGroup>

            <SectionLabel>About</SectionLabel>
            <SettingsGroup>
              <Row label="Version" trailing={<span className="text-muted-foreground">1.0.0</span>} />
              <Row label="Terms of Service" />
              <Row label="Privacy Policy" last />
            </SettingsGroup>

            <button
              onClick={handleSignOut}
              className="tap mt-4 flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-secondary text-[15px] font-semibold text-destructive"
            >
              <LogOut className="h-[18px] w-[18px]" strokeWidth={2} />
              Sign out
            </button>
          </>
        )}
      </div>

      <TabBarSpacer />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[16px] border border-border bg-card px-4 py-3.5 shadow-soft">
      <div className="font-display text-[28px] font-bold leading-none tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function SettingsGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-border bg-card shadow-soft">
      {children}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  trailing,
  last,
}: {
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  trailing?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      className={`tap flex h-12 w-full items-center gap-3 px-4 text-left ${
        last ? "" : "hairline-b"
      }`}
    >
      {Icon && <Icon className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.75} />}
      <span className="flex-1 text-[15px] text-foreground">{label}</span>
      {trailing ?? <ChevronRight className="h-4 w-4 text-muted-foreground/60" strokeWidth={2} />}
    </button>
  );
}
