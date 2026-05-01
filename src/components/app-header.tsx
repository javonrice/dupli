import { Link } from "@tanstack/react-router";
import wordmark from "@/assets/dupli-wordmark.png";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-2xl items-center justify-between px-5">
        <Link to="/" className="flex items-center" aria-label="Dupli — home">
          <img
            src={wordmark}
            alt="Dupli"
            width={1536}
            height={1024}
            className="h-12 w-auto sm:h-14"
          />
        </Link>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          AI Dupe Finder
        </span>
      </div>
    </header>
  );
}
