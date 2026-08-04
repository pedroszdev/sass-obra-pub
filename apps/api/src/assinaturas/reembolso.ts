// Política de reembolso (T-218). Regra PURA, com `now` injetável (§3.3): é
// dinheiro do cliente, e o backend é quem decide — o front só renderiza.
//
// 🔴 **O prazo NÃO é uma escolha de produto: é piso legal.** O art. 49 do CDC dá
// 7 dias de arrependimento em compra fora do estabelecimento comercial, e o
// entendimento corrente é que isso alcança SaaS vendido pela internet. Aumentar
// é liberalidade nossa; diminuir não é uma opção que exista.
//
// ⚠️ Por isso o passo manual do fluxo (decisão do dono, 04/08) é OPERACIONAL,
// não um portão para recusar: dentro destes 7 dias o reembolso é direito do
// cliente. Recusar aqui é assumir risco jurídico, e o código não deve sugerir
// que essa porta existe.
export const REEMBOLSO_PRAZO_DIAS = 7;

/** Uma cobrança, no que a política precisa ler. */
export interface CobrancaReembolsavel {
  id?: string;
  status?: string;
  billingType?: string;
  /**
   * 🔴 **São TRÊS datas, e usar a errada quebra a política.** Medido no
   * provedor (04/08), numa cobrança de CARTÃO com status `CONFIRMED`:
   *
   *   paymentDate: null · clientPaymentDate: '2026-08-04' · confirmedDate: '2026-08-04'
   *
   * `paymentDate` só é preenchido quando o dinheiro é **creditado** — e no
   * cartão o `creditDate` fica ~30 dias à frente. Contar o prazo por ele
   * deixaria o reembolso indisponível durante exatamente os 7 dias em que ele é
   * DIREITO do cliente, e o card sumiria da tela (bug real, visto pelo dono).
   *
   * No boleto as três coincidem, então o erro não aparecia ali — o que torna
   * este o tipo de bug que passa num provedor e some no outro.
   */
  paymentDate?: string;
  /** Quando o CLIENTE pagou. É este o marco do prazo — ver acima. */
  clientPaymentDate?: string;
  confirmedDate?: string;
  /** Valor em REAIS, como o Asaas devolve. */
  value?: number;
}

export interface Elegibilidade {
  /** `null` quando não há cobrança paga que sirva de base. */
  pagamentoId: string | null;
  /** Dentro dos 7 dias do CDC. */
  dentroDoPrazo: boolean;
  /** Quando o prazo acaba — a tela precisa DIZER a data, não "7 dias". */
  prazoAte: Date | null;
  /**
   * O provedor consegue estornar este meio pela API?
   *
   * 🔴 Cartão e Pix sim; **boleto não** — a API de estorno do Asaas não o
   * cobre, e devolver dinheiro de boleto exige transferência, que é operação
   * manual fora do sistema. Prometer self-service para boleto seria prometer o
   * que não temos como executar.
   */
  estornavelPelaApi: boolean;
}

/** Pago: os estados em que o dinheiro de fato entrou. */
const PAGAS = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);

/** Meios que a API de estorno do Asaas cobre (medido na doc, 04/08). */
const ESTORNAVEIS = new Set(['CREDIT_CARD', 'PIX']);

/**
 * A cobrança que serve de base ao reembolso e se ela ainda está no prazo.
 *
 * É sempre a **paga mais recente**: é ela que o cliente acabou de pagar e da
 * qual se arrepende. Cobranças antigas do mesmo assinante já tiveram o seu
 * prazo e não voltam a tê-lo.
 */
export function elegibilidadeReembolso(
  cobrancas: CobrancaReembolsavel[],
  now: Date = new Date(),
): Elegibilidade {
  const pagas = cobrancas
    .filter((c) => c.status && PAGAS.has(c.status))
    // Ordem deliberada: `clientPaymentDate` é literalmente "quando o cliente
    // pagou", que é o marco do art. 49. Os outros são fallback para o caso de o
    // provedor não preencher o primeiro.
    .map((c) => ({
      c,
      pagoEm:
        parseData(c.clientPaymentDate) ??
        parseData(c.confirmedDate) ??
        parseData(c.paymentDate),
    }))
    .filter(
      (x): x is { c: CobrancaReembolsavel; pagoEm: Date } => x.pagoEm !== null,
    )
    .sort((a, b) => b.pagoEm.getTime() - a.pagoEm.getTime());

  const ultima = pagas[0];
  if (!ultima) {
    return {
      pagamentoId: null,
      dentroDoPrazo: false,
      prazoAte: null,
      estornavelPelaApi: false,
    };
  }

  const prazoAte = new Date(
    ultima.pagoEm.getTime() + REEMBOLSO_PRAZO_DIAS * 86_400_000,
  );
  return {
    pagamentoId: ultima.c.id ?? null,
    dentroDoPrazo: prazoAte.getTime() > now.getTime(),
    prazoAte,
    estornavelPelaApi: ESTORNAVEIS.has(ultima.c.billingType ?? ''),
  };
}

/**
 * Data do Asaas → instante. Aceita `YYYY-MM-DD` e `YYYY-MM-DD HH:mm:ss`, ambos
 * em horário de BRASÍLIA (o servidor roda em UTC — §8).
 *
 * ⚠️ Repete a lógica do `dataAsaas` de propósito: importar de
 * `asaas-webhook.service` traria o serviço inteiro para dentro de um arquivo que
 * precisa ser puro e sem dependência de módulo.
 */
function parseData(valor?: string): Date | null {
  if (!valor) return null;
  const texto = valor.trim();
  const comHora = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(texto);
  const soData = /^\d{4}-\d{2}-\d{2}$/.test(texto);
  if (!comHora && !soData) return null;
  const iso = soData
    ? `${texto}T00:00:00-03:00`
    : `${texto.replace(' ', 'T').slice(0, 19)}-03:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
