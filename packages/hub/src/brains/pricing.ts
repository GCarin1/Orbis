// USD per million tokens, per model family (specs/usage). Prefix match, longest first.
// Anthropic first-party list prices; OpenAI-compatible local servers cost nothing.

export interface Price {
  input: number;
  output: number;
  /** Cache reads; defaults to 10% of input. */
  cacheRead?: number;
  /** Cache writes (5-minute TTL); defaults to 125% of input. */
  cacheWrite?: number;
}

export const PRICES: Record<string, Price> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-mythos-5-1": { input: 10, output: 50 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export function priceFor(model: string, table: Record<string, Price> = PRICES): Price | null {
  const key = Object.keys(table)
    .filter((prefix) => model === prefix || model.startsWith(`${prefix}-`) || model.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0];
  return key ? table[key]! : null;
}

export interface TokenCounts {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/** Cost in USD; zero for a model with no known price (local models, unknown ids). */
export function costOf(model: string, tokens: TokenCounts, table: Record<string, Price> = PRICES): number {
  const price = priceFor(model, table);
  if (!price) return 0;
  const cacheRead = price.cacheRead ?? price.input * 0.1;
  const cacheWrite = price.cacheWrite ?? price.input * 1.25;
  const usd =
    (tokens.input * price.input + tokens.output * price.output + (tokens.cacheRead ?? 0) * cacheRead + (tokens.cacheWrite ?? 0) * cacheWrite) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}
