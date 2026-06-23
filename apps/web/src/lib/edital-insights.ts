// ⚠️ PLACEHOLDER — fora do escopo desta fase (CLAUDE.md §9).
//
// As seções "Resumo com IA" e "Prontidão da empresa para esta obra" do detalhe
// ainda NÃO têm backend (resumo por IA e diagnóstico de prontidão são features
// futuras). Aqui o conteúdo é apenas DERIVADO no cliente a partir dos campos do
// próprio edital (texto templated) + itens de prontidão MOCKADOS — só para a
// casca visual do design. Substituir por endpoints reais quando existirem.

import type { EditalDetail } from '../types/edital';
import { brl, daysUntil, fmtDate } from './format';

export type RiscoNivel = 'alto' | 'medio' | 'baixo';

export interface RiscoItem {
  label: string;
  nivel: RiscoNivel;
}

export interface ProntidaoItem {
  label: string;
  ok: boolean;
}

export interface Prontidao {
  label: string;
  score: number;
  itens: ProntidaoItem[];
}

/** Texto-resumo templated a partir dos campos do edital (não é IA de verdade). */
export function resumoIA(e: EditalDetail): string {
  const valor =
    e.valorEstimado != null
      ? `valor estimado de ${brl(e.valorEstimado)}`
      : 'valor estimado não informado';
  const prazo = e.prazoProposta
    ? `As propostas podem ser enviadas até ${fmtDate(e.prazoProposta)}.`
    : 'O prazo para envio de propostas não foi informado.';
  return (
    `${e.orgaoNome} (${e.municipioNome}/${e.uf}) abriu uma licitação na modalidade ` +
    `${e.modalidadeNome.toLowerCase()}, com ${valor}, para a seguinte obra: ${e.objeto} ` +
    `${prazo} Trata-se de contratação de obra pública, atualmente com a situação ` +
    `"${e.situacao ?? 'não informada'}".`
  );
}

/** Até 3 "pontos de atenção" derivados de heurísticas simples sobre o edital. */
export function riscos(e: EditalDetail): RiscoItem[] {
  const out: RiscoItem[] = [];
  const dias = daysUntil(e.prazoProposta);

  if (e.valorEstimado != null && e.valorEstimado >= 5_000_000) {
    out.push({
      label:
        'Valor elevado: provável exigência de atestado de capacidade técnica de grande porte e de garantia de proposta.',
      nivel: 'alto',
    });
  }
  if (dias >= 0 && dias <= 10) {
    out.push({
      label:
        'Prazo curto para montar a proposta e realizar visita técnica, se exigida.',
      nivel: 'medio',
    });
  }
  if (e.modalidadeNome.includes('Tomada')) {
    out.push({
      label:
        'Tomada de Preços costuma exigir registro cadastral prévio antes da data da sessão.',
      nivel: 'medio',
    });
  } else if (e.modalidadeNome.includes('Concorrência')) {
    out.push({
      label:
        'Concorrência pode exigir índices contábeis mínimos (liquidez e endividamento).',
      nivel: 'medio',
    });
  }
  out.push({
    label:
      'Confira no edital a exigência de garantia contratual e o BDI máximo admitido.',
    nivel: 'baixo',
  });

  return out.slice(0, 3);
}

/** Prontidão MOCKADA da empresa para a obra (5 requisitos fixos). */
export function prontidaoObra(): Prontidao {
  const itens: ProntidaoItem[] = [
    { label: 'Habilitação jurídica (contrato social, CNPJ)', ok: true },
    { label: 'Regularidade fiscal e trabalhista (CND, FGTS, CNDT)', ok: false },
    { label: 'Qualificação técnica (atestado/CAT compatível com o objeto)', ok: true },
    { label: 'Qualificação econômico-financeira (balanço, capital social)', ok: true },
    { label: 'Cadastro SICAF no nível de habilitação', ok: false },
  ];
  const ok = itens.filter((i) => i.ok).length;
  return {
    score: Math.round((ok / itens.length) * 100),
    label: `${ok} de ${itens.length} requisitos`,
    itens,
  };
}
