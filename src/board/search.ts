export interface SearchDoc {
  number: number;
  title: string;
  thread: string | null;
  assignee: string | null;
  notes?: string | null;
  steps?: string[];
}

/** True when every whitespace-separated word of the query matches the doc. */
export function matchesQuery(doc: SearchDoc, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) {
    return true;
  }
  const haystacks = [doc.title, doc.notes ?? "", ...(doc.steps ?? []), doc.thread ?? "", doc.assignee ?? ""].map((s) =>
    s.toLowerCase(),
  );
  const assignee = (doc.assignee ?? "").toLowerCase();
  return words.every((word) => {
    if (word === String(doc.number) || word === `t${doc.number}`) {
      return true;
    }
    const bare = word.startsWith("@") ? word.slice(1) : word;
    if (word.startsWith("@")) {
      return bare !== "" && assignee.includes(bare);
    }
    return haystacks.some((h) => h.includes(bare));
  });
}
