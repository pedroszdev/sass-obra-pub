import { IsIn, IsOptional } from 'class-validator';
import { Plano, PLANOS } from '../precos';

/** Caminho de cobrança escolhido pelo usuário. */
export type MeioPagamento = 'cartao' | 'boleto_pix';
export const MEIOS: readonly MeioPagamento[] = [
  'cartao',
  'boleto_pix',
] as const;

// Qual plano o usuário escolheu no Checkout (T-131).
//
// `@IsIn` fecha a porta: sem ele, um `plano` arbitrário do cliente viraria uma
// leitura de config e, no limite, um price que não vendemos.
export class CriarCheckoutDto {
  // Opcional por compatibilidade: antes da T-131 o checkout não tinha plano, e
  // um front em cache (PWA) pode não mandá-lo. Ausente = mensal, o que já era.
  @IsOptional()
  @IsIn(PLANOS)
  plano?: Plano;

  // Como o usuário quer pagar (T-208/T-213). ⚠️ NÃO é firula de UI: os dois
  // meios usam ENDPOINTS DIFERENTES do Asaas, porque o checkout hospedado só
  // aceita cartão em recorrência ("CREDIT_CARD é o único método permitido para
  // operações RECURRENT" — medido na T-209). Boleto e Pix vão por
  // `POST /subscriptions` com `billingType: UNDEFINED`, onde o pagador escolhe
  // entre os dois a cada cobrança.
  //
  // Ausente = `cartao`, que era o único caminho antes disto.
  @IsOptional()
  @IsIn(MEIOS)
  meio?: MeioPagamento;
}
