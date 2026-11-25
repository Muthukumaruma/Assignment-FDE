import { chunkDocument } from '../ingest/chunker.js';

/**
 * Rule-based ATS (applicant tracking system) checklist for a resume.
 *
 * Deliberately not an LLM call: these are mechanical properties that rules check exactly,
 * instantly and for free, with the same answer every time, which makes them easy to trust and explain.
 * Judgement calls (how relevant is this experience?) live in the per-job fit analysis instead.
 */

export interface AtsCheck {
  id: 'contact' | 'sections' | 'metrics' | 'length' | 'links';
  label: string;
  passed: boolean;
  detail: string;
}

// All quantifiers are bounded: resumes can be up to 200k characters and unbounded repeats
// backtrack quadratically on adversarial input (measured: 15 s → milliseconds).
const EMAIL = /\b[\w.+-]{1,64}@[\w-]{1,63}\.[\w.-]{2,63}/;
const PHONE = /(?:\+?\d[\s-]?){9,14}\d/;
const LINK = /\b(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com|https?:\/\/)\S{1,200}/i;
// A "measurable result": a percentage, a currency amount, or a number with a scale/unit word.
const METRIC = /(?<![\d.,])(?:\d{1,6}(?:\.\d{1,3})?\s?%|[$₹€£]\s?\d[\d,.]{0,15}\s?[kmb]?|\d[\d,.]{0,15}\s?(?:k|m|x|\+)?\s?(?:users|customers|requests|engineers|people|ms|hours|days|clients|members|projects|million|billion)\b)/gi;
/** Contact details and links live at the top of a resume; no need to scan the whole thing. */
const HEADER_CHARS = 5000;

const REQUIRED_SECTIONS: { name: string; match: RegExp }[] = [
  { name: 'Skills', match: /skill|tech stack/i },
  { name: 'Experience', match: /experience|employment/i },
  { name: 'Education', match: /education/i },
];

export function atsChecks(text: string): AtsCheck[] {
  const sections = new Set(chunkDocument(text).map((c) => c.section));
  const words = text.split(/\s+/).filter(Boolean).length;
  const metrics = text.match(METRIC)?.length ?? 0;

  const header = text.slice(0, HEADER_CHARS);
  const hasEmail = EMAIL.test(header);
  const hasPhone = PHONE.test(header);
  const hasLink = LINK.test(header);
  const missingSections = REQUIRED_SECTIONS.filter((r) => ![...sections].some((s) => r.match.test(s))).map((r) => r.name);

  return [
    {
      id: 'contact',
      label: 'Contact details',
      passed: hasEmail && hasPhone,
      detail: hasEmail && hasPhone ? 'Email and phone number found.' : `Add your ${[!hasEmail && 'email', !hasPhone && 'phone number'].filter(Boolean).join(' and ')} at the top.`,
    },
    {
      id: 'sections',
      label: 'Standard section headings',
      passed: missingSections.length === 0,
      detail: missingSections.length === 0 ? 'Skills, Experience and Education headings found.' : `Add clearly titled sections: ${missingSections.join(', ')}. ATS parsers look for these headings.`,
    },
    {
      id: 'metrics',
      label: 'Measurable results',
      passed: metrics >= 3,
      detail: metrics >= 3 ? `${metrics} quantified results found.` : `Only ${metrics} quantified result${metrics === 1 ? '' : 's'} found. Add numbers (%, users, time or money saved) to at least 3 bullets.`,
    },
    {
      id: 'length',
      label: 'Length',
      passed: words >= 300 && words <= 1200,
      detail:
        words < 300 ? `About ${words} words: too thin. Aim for 400-900 words.` : words > 1200 ? `About ${words} words: too long. Aim for 2 pages or less.` : `About ${words} words: a good length.`,
    },
    {
      id: 'links',
      label: 'Profile links',
      passed: hasLink,
      detail: hasLink ? 'LinkedIn, GitHub or portfolio link found.' : 'Add a LinkedIn, GitHub or portfolio link near the top.',
    },
  ];
}
