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
