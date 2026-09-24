interface ComingSoonProps {
  title: string;
  phase: string;
}

/**
 * Usado apenas para as páginas cuja fase ainda não foi implementada.
 * Deliberadamente não tem botões nem dados fake — a spec do projeto proíbe
 * "botões que não fazem nada" e "dados mockados permanentes".
 */
export function ComingSoon({ title, phase }: ComingSoonProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      <p className="max-w-sm text-sm text-text-muted">
        Esta área será implementada na {phase}, conforme o roadmap do projeto.
      </p>
    </div>
  );
}
