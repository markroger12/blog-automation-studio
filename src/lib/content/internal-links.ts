import { normalizeForMatch } from './seo';

export interface LinkCandidate {
  url: string;
  title: string;
  categoryName?: string | null;
  primaryKeyword?: string | null;
  createdAt?: Date;
  broken?: boolean;
}

export interface ChooseInput {
  keyword: string;
  categoryName: string | null;
  selfUrl?: string | null;
  candidates: LinkCandidate[];
}

function tokens(s: string): Set<string> {
  return new Set(normalizeForMatch(s).split(' ').filter((w) => w.length > 2));
}

/** Picks the most relevant earlier post: shared entity/keyword tokens and category first, recency as tiebreak. */
export function chooseInternalLink(input: ChooseInput): { candidate: LinkCandidate; score: number; reason: string } | null {
  const kw = tokens(input.keyword);
  const scored = input.candidates
    .filter((c) => !c.broken && c.url && c.url !== input.selfUrl)
    .map((c) => {
      const t = tokens(`${c.title} ${c.primaryKeyword ?? ''}`);
      let overlap = 0;
      for (const w of kw) if (t.has(w)) overlap++;
      const sameCat = !!input.categoryName && c.categoryName === input.categoryName;
      const score = overlap * 3 + (sameCat ? 2 : 0) + (c.createdAt ? c.createdAt.getTime() / 1e15 : 0);
      const reason = overlap ? `Shares ${overlap} keyword term(s)${sameCat ? ' and category' : ''}` : sameCat ? 'Same category' : 'Latest available post';
      return { candidate: c, score, reason };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0] ?? null;
}
