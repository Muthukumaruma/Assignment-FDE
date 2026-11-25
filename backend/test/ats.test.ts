import { describe, expect, it } from 'vitest';
import { atsChecks } from '../src/resume/ats.js';

const GOOD = `Jane Doe
jane@example.com · +91 98765 43210 · linkedin.com/in/jane · github.com/jane
SUMMARY
Full-stack engineer.
SKILLS
React, Node.js, MongoDB
EXPERIENCE
Acme 2020-2024
- Cut page load by 40% for 2M users
- Reduced costs by $120k per year
- Led a team of 5 engineers
${'Built and shipped features across the stack. '.repeat(40)}
EDUCATION
B.E. Computer Science`;

const byId = (text: string) => Object.fromEntries(atsChecks(text).map((c) => [c.id, c]));

describe('atsChecks (rule-based, deterministic)', () => {
  it('passes a well-formed resume on every check', () => {
    const checks = atsChecks(GOOD);
    expect(checks.map((c) => c.id)).toEqual(['contact', 'sections', 'metrics', 'length', 'links']);
    expect(checks.filter((c) => !c.passed)).toEqual([]);
  });

  it('flags missing contact details', () => {
    expect(byId('Jane\nSKILLS\nReact').contact.passed).toBe(false);
  });

  it('names the missing standard sections', () => {
    const c = byId('Jane jane@x.com +1 555 123 4567\nSKILLS\nReact').sections;
    expect(c.passed).toBe(false);
    expect(c.detail).toMatch(/Experience/);
    expect(c.detail).toMatch(/Education/);
  });

  it('wants at least 3 measurable results', () => {
    expect(byId('EXPERIENCE\n- Built things\n- Improved stuff by 10%').metrics.passed).toBe(false);
  });

  it('flags resumes that are too short', () => {
    expect(byId('Jane\nEXPERIENCE\nDev').length.passed).toBe(false);
  });

  it('flags a missing LinkedIn/GitHub/portfolio link', () => {
    expect(byId('jane@x.com').links.passed).toBe(false);
  });
});
