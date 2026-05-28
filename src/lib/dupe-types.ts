export type DupePair = {
  pairId: string;
  matchPct: number;
  original: {
    id: string;
    brand: string;
    name: string;
    imageUrl: string;
    priceUsd: number;
  };
  dupe: {
    id: string;
    brand: string;
    name: string;
    imageUrl: string;
    priceUsd: number;
  };
  savingsUsd: number;
};

export type SlideResult =
  | { slide: 1 | 2 | 3 | 4; ok: true; dataUrl: string }
  | { slide: 1 | 2 | 3 | 4; ok: false; error: string };

export type ReelSegmentKey =
  | "hook"
  | "reveal_1"
  | "reveal_2"
  | "reveal_3"
  | "reveal_4"
  | "cta";

export const REVEAL_KEYS: ReelSegmentKey[] = [
  "reveal_1",
  "reveal_2",
  "reveal_3",
  "reveal_4",
];

export type ReelSegment = {
  key: ReelSegmentKey;
  text: string;
  audioDataUrl: string;
  durationSec: number;
};

export type ReelScript = {
  pairs: DupePair[];
  segments: ReelSegment[];
};
