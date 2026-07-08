import { Raw } from 'typeorm';

// Situações do PNCP que tiram o edital de jogo (T-114): proposta impossível
// (Anulada/Revogada) ou processo pausado (Suspensa). Domínio observado no feed
// de atualização do PNCP no spike da T-114 — centralizado aqui para nunca
// espalhar as strings pelo código (§3.3).
//
// `null` e "Divulgada no PNCP" (e qualquer valor desconhecido) contam como ATIVO
// — favor recall: só escondemos o que positivamente sabemos estar morto/suspenso.
export const SITUACOES_INATIVAS = ['Anulada', 'Revogada', 'Suspensa'] as const;

export type SituacaoInativa = (typeof SITUACOES_INATIVAS)[number];

export function isSituacaoInativa(
  situacao: string | null | undefined,
): situacao is SituacaoInativa {
  return (
    situacao != null &&
    (SITUACOES_INATIVAS as readonly string[]).includes(situacao)
  );
}

// Condição TypeORM "edital ainda em jogo": situação nula OU fora da lista de
// inativas. Usada na busca, agenda e alertas para esconder anulado/revogado/
// suspenso (decisão do dono: sumir, não marcar — o detalhe por id ainda abre com
// badge). Gera params nomeados (`:sit0..N`) a partir da constante — sem depender
// da expansão `:...` e sem inlinar strings no SQL.
export function situacaoAtivaWhere(): ReturnType<typeof Raw> {
  const params: Record<string, string> = {};
  const placeholders = SITUACOES_INATIVAS.map((situacao, i) => {
    params[`sit${i}`] = situacao;
    return `:sit${i}`;
  });
  return Raw(
    (alias) =>
      `(${alias} IS NULL OR ${alias} NOT IN (${placeholders.join(', ')}))`,
    params,
  );
}
