export type NormalizedComp = {
  source: string;
  source_url: string;
  source_title: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  mileage: number | null;
  asking_price: number | null;
  city: string | null;
  state: string | null;
  condition: string | null;
  mods: string | null;
  posted_at?: string | null;
};

export type ValuationResult = {
  value_low: number;
  value_mid: number;
  value_high: number;
  confidence: number;
  comp_count: number;
  key_factors: string[];
};

