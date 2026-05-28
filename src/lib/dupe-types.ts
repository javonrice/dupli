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
