import { IsIn, IsOptional } from 'class-validator';
import { Plano, PLANOS } from '../precos';

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
}
