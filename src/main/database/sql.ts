/** Padrão para `LIKE ? ESCAPE '\'` que procura o texto em qualquer posição, tratando %, _ e \ como literais. */
export function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
