export interface Source {
  label: string;
  section: string;
}

const CITATION = /\[((?:Resume|Job #\d{1,3}))\s{0,2}(?:›|>)\s{0,2}([^\]\n]{1,60})\]/g;

/**
 * Output guardrail: a citation must point at a document that was actually in the context.
 * Invented citations ("[Job #9 › Skills]" when there is no Job #9) are removed from the text.
 */
export function filterCitations(answer: string, allowedLabels: string[]): { text: string; sources: Source[] } {
  const allowed = new Set(allowedLabels);
  const sources = new Map<string, Source>();
  const text = answer
    .replace(CITATION, (whole, label: string, section: string) => {
      if (!allowed.has(label)) return '';
      const s = { label, section: section.trim() };
      sources.set(`${s.label}›${s.section}`, s);
      return whole;
    })
    .replace(/ {2,}/g, ' ');
  return { text, sources: [...sources.values()] };
}
