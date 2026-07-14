// Link público da compra no PNCP, derivado do `numeroControlePNCP` (T-142).
//
// Por que derivar em vez de guardar: o `linkSistemaOrigem` que o PNCP entrega
// (→ `linkOrigem`) é OPCIONAL e boa parte dos órgãos não preenche — nesses
// editais o botão "ver edital" ficava desabilitado, como se não houvesse
// documento. Mas todo edital captado TEM `numeroControlePNCP` (é a chave de
// dedup, §3.2), e dele sai a página pública da compra no portal, que lista os
// documentos. Nada a persistir: é função do dado que já está no banco.

export interface ControlePncp {
  cnpj: string;
  sequencial: string;
  ano: string;
}

// "{cnpj}-1-{sequencial}/{ano}" → partes. O sequencial perde os zeros à esquerda
// (é assim que a API de arquivos e o portal o esperam: .../2026/319, não /000319).
export function parseNumeroControlePncp(
  numeroControle: string | null | undefined,
): ControlePncp | null {
  if (!numeroControle) return null;
  const m = /^(\d+)-\d+-(\d+)\/(\d+)$/.exec(numeroControle.trim());
  if (!m) return null;
  return { cnpj: m[1], sequencial: String(Number(m[2])), ano: m[3] };
}

// Página pública da compra: https://pncp.gov.br/app/editais/{cnpj}/{ano}/{seq}
// null quando o número de controle está fora do padrão (não inventa link).
export function pncpLinkEdital(
  numeroControle: string | null | undefined,
): string | null {
  const p = parseNumeroControlePncp(numeroControle);
  if (!p) return null;
  return `https://pncp.gov.br/app/editais/${p.cnpj}/${p.ano}/${p.sequencial}`;
}
