/**
 * Works out which job(s) a question is about, so retrieval can be filtered to them.
 * Without this, "What am I missing for Job #2?" would also pull Job #1's requirements
 * (they look semantically similar), and the answer would mix jobs up.
 */

export interface RoutableDoc {
  id: string;
  kind: 'resume' | 'job';
  label: string;
  title: string;
  company?: string;
}

// Words too generic to identify one job ("engineer" appears in most titles).
const GENERIC = new Set([
  'senior', 'junior', 'lead', 'principal', 'staff', 'engineer', 'engineering', 'developer', 'development',
  'role', 'position', 'team', 'company', 'full', 'stack', 'full-stack', 'software', 'manager', 'intern',
  'remote', 'hybrid', 'india', 'global', 'technologies', 'solutions', 'labs', 'inc', 'ltd',
]);

const tokens = (s: string) => s.toLowerCase().match(/[a-z0-9][a-z0-9+.#-]*/g) ?? [];

export function resolveTargets(question: string, docs: RoutableDoc[]): { jobIds: string[]; missingRefs: string[] } {
  const jobs = docs.filter((d) => d.kind === 'job');
  const byNumber = new Map(jobs.map((j) => [Number(j.label.replace(/\D/g, '')), j.id]));
  const jobIds = new Set<string>();
  const missingRefs: string[] = [];

  // 1) Explicit numbers: "Job #2", "job 2", "#2". Bounded quantifiers keep the regex linear.
  for (const m of question.matchAll(/(?:\bjob\s{0,3}#?\s{0,3}|#)(\d{1,3})\b/gi)) {
    const n = Number(m[1]);
    const id = byNumber.get(n);
    if (id) jobIds.add(id);
    else if (!missingRefs.includes(`Job #${n}`)) missingRefs.push(`Job #${n}`);
  }

  // 2) Distinctive title/company words: a word ≥4 chars that identifies exactly one job.
  const q = new Set(tokens(question));
  const owners = new Map<string, Set<string>>();
  for (const j of jobs) {
    for (const t of tokens(`${j.title} ${j.company ?? ''}`)) {
      if (t.length < 4 || GENERIC.has(t)) continue;
      if (!owners.has(t)) owners.set(t, new Set());
      owners.get(t)!.add(j.id);
    }
  }
  for (const [t, ids] of owners) if (ids.size === 1 && q.has(t)) jobIds.add([...ids][0]);

  return { jobIds: [...jobIds], missingRefs };
}
