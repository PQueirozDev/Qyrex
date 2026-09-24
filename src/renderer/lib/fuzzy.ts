/**
 * Fuzzy match com pontuação (estilo Raycast/VS Code): todos os caracteres da
 * busca precisam aparecer em ordem; letras consecutivas e início de palavra
 * valem mais. Acentos são ignorados ("acao" encontra "Ação").
 */

export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function fuzzyScore(query: string, target: string): number | null {
  const q = normalizeText(query.trim());
  if (!q) return 0;
  const t = normalizeText(target);

  // Substring exata sempre ganha.
  const idx = t.indexOf(q);
  if (idx !== -1) return 1000 - idx * 2 - (t.length - q.length) * 0.1 + (idx === 0 || /\W/.test(t[idx - 1]) ? 200 : 0);

  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    let found = false;
    while (ti < t.length) {
      if (t[ti] === ch) {
        const wordStart = ti === 0 || /[\s\-_:./\\]/.test(t[ti - 1]);
        streak += 1;
        score += 1 + streak * 2 + (wordStart ? 8 : 0);
        ti++;
        found = true;
        break;
      }
      streak = 0;
      ti++;
    }
    if (!found) return null;
  }
  return score - t.length * 0.05;
}

export function fuzzyFilter<T>(items: T[], query: string, getText: (item: T) => string): T[] {
  if (!query.trim()) return items;
  return items
    .map((item) => ({ item, score: fuzzyScore(query, getText(item)) }))
    .filter((r): r is { item: T; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
}
