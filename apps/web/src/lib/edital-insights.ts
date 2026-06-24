// ⚠️ PLACEHOLDER PARCIAL.
//
// O "Resumo com IA" do detalhe já é REAL (T-50 — ver components/ResumoIA.tsx,
// hooks/useEditalIA.ts). O que continua MOCKADO aqui é a "Prontidão da empresa
// para esta obra" (diagnóstico específico por edital) — vira real na T-52,
// cruzando as exigências extraídas do edital (T-49) com o perfil (T-40).

export interface ProntidaoItem {
  label: string;
  ok: boolean;
}

export interface Prontidao {
  label: string;
  score: number;
  itens: ProntidaoItem[];
}

/** Prontidão MOCKADA da empresa para a obra (5 requisitos fixos). */
export function prontidaoObra(): Prontidao {
  const itens: ProntidaoItem[] = [
    { label: 'Habilitação jurídica (contrato social, CNPJ)', ok: true },
    { label: 'Regularidade fiscal e trabalhista (CND, FGTS, CNDT)', ok: false },
    {
      label: 'Qualificação técnica (atestado/CAT compatível com o objeto)',
      ok: true,
    },
    {
      label: 'Qualificação econômico-financeira (balanço, capital social)',
      ok: true,
    },
    { label: 'Cadastro SICAF no nível de habilitação', ok: false },
  ];
  const ok = itens.filter((i) => i.ok).length;
  return {
    score: Math.round((ok / itens.length) * 100),
    label: `${ok} de ${itens.length} requisitos`,
    itens,
  };
}
