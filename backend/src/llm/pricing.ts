/** USD per 1M tokens [input, output]. Keep in sync with https://openai.com/api/pricing. */
const PRICES: Record<string, [number, number]> = {
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4o': [2.5, 10],
  'gpt-4.1-mini': [0.4, 1.6],
  'gpt-4.1': [2, 8],
  'text-embedding-3-small': [0.02, 0],
  'text-embedding-3-large': [0.13, 0],
};

export function costUsd(model: string, promptTokens: number, completionTokens: number): number {
  // Longest prefix wins so "gpt-4o-mini-2024-07-18" is priced as gpt-4o-mini, not gpt-4o.
  const key = Object.keys(PRICES)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  if (!key) return 0;
  const [inPrice, outPrice] = PRICES[key];
  return (promptTokens * inPrice + completionTokens * outPrice) / 1_000_000;
}
