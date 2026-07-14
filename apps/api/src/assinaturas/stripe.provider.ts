import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

// Cliente da Stripe (BACKLOG T-128). Um provider separado por dois motivos:
// (a) o serviço fica testável (o teste injeta um cliente falso, sem rede);
// (b) a ausência da chave vira `null` num lugar só, em vez de espalhar checagem.
//
// SEM `STRIPE_SECRET_KEY` → `null`: os endpoints de cobrança respondem 503 e o
// RESTO DO PRODUTO SEGUE INTEIRO. Mesma degradação da IA, do Google e do e-mail
// (§8) — uma integração opcional ausente nunca derruba o boot.
//
// A chave deve ser uma **restricted key (`rk_`)**, não a secreta (`sk_`), com o
// mínimo: escrita em Customers, Checkout Sessions, Subscriptions e Billing Portal
// Sessions; leitura em Prices. Chave vazada com permissão total é dano ilimitado.
export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

export const StripeClientProvider: Provider = {
  provide: STRIPE_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Stripe | null => {
    const logger = new Logger('StripeClient');
    const chave = config.get<string>('STRIPE_SECRET_KEY')?.trim();
    if (!chave) {
      logger.warn('STRIPE_SECRET_KEY ausente — cobrança desabilitada (503).');
      return null;
    }
    if (chave.startsWith('sk_')) {
      // Não bloqueia (o dono pode ter motivo), mas registra: é o oposto do menor
      // privilégio, e a Stripe recomenda explicitamente a chave restrita.
      logger.warn(
        'STRIPE_SECRET_KEY é uma chave SECRETA (sk_). Prefira uma restrita (rk_).',
      );
    }
    return new Stripe(chave, {
      // Um retry automático cobre a falha de rede pontual sem duplicar cobrança:
      // as chamadas de escrita levam chave de idempotência (ver o service).
      maxNetworkRetries: 1,
      timeout: 10_000,
    });
  },
};
