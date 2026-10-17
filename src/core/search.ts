// Tiny BM25 search over processes and steps. Browser-safe (used by portal + server "ask").
export interface SearchDoc {
  id: string; // processId or processId#stepId
  processId: string;
  stepId?: string;
  title: string;
  text: string;
}

export interface SearchHit {
  doc: SearchDoc;
  score: number;
}

const STOP = new Set(
  "a an and are as at be by do does for from how i in is it my of on or the to what when where which who why with you your can create make new add get set use using into via"
    .split(" ")
    .concat("og en et i på til af for med at det der den de som jeg hvordan hvad er".split(" "))
    .concat("und der die das ein eine ich wie was ist mit für auf zu im den dem von".split(" ")),
);

export function tokenize(s: string): string[] {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\*\*/g, " ")
    .split(/[^a-z0-9æøåäöüß]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

function stem(t: string): string {
  // very light English-ish stemming so "customers"/"customer", "posting"/"post" match
  return t.replace(/(ing|ers|er|es|s|ed)$/, "") || t;
}

export class SearchIndex {
  private docs: SearchDoc[] = [];
  private tf: Map<string, number>[] = [];
  private df = new Map<string, number>();
  private lens: number[] = [];
  private avg = 0;

  constructor(docs: SearchDoc[] = []) {
    for (const d of docs) this.add(d);
  }

  add(doc: SearchDoc) {
    const toks = [...tokenize(doc.title), ...tokenize(doc.title), ...tokenize(doc.text)];
    const m = new Map<string, number>();
    for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1);
    for (const t of m.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.docs.push(doc);
    this.tf.push(m);
    this.lens.push(toks.length);
    this.avg = this.lens.reduce((a, b) => a + b, 0) / this.lens.length;
  }

  search(query: string, limit = 10): SearchHit[] {
    const q = [...new Set(tokenize(query))];
    if (!q.length) return [];
    const N = this.docs.length;
    const k1 = 1.4,
      b = 0.75;
    const hits: SearchHit[] = [];
    this.docs.forEach((doc, i) => {
      let score = 0;
      for (const t of q) {
        // prefix match lets "cust" find "customer"
        let f = this.tf[i].get(t) ?? 0;
        let df = this.df.get(t) ?? 0;
        if (!f && t.length >= 3) {
          for (const [k, v] of this.tf[i]) if (k.startsWith(t)) f += v * 0.7;
          if (f) for (const [k, v] of this.df) if (k.startsWith(t)) df = Math.max(df, v);
        }
        if (!f) continue;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * this.lens[i]) / (this.avg || 1)));
      }
      if (score > 0) hits.push({ doc, score });
    });
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
