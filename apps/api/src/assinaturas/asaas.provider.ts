import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsaasClient } from './asaas-client';

// Cliente do Asaas (T-212, Épico 17). Mesmo desenho do `StripeClientProvider`:
// (a) o serviço fica testável (o teste injeta um cliente falso, sem rede);
// (b) a ausência da chave vira `null` num lugar só.
//
// SEM `ASAAS_API_KEY` → `null`: os endpoints de cobrança do Asaas respondem 503
// e o RESTO DO PRODUTO SEGUE INTEIRO — a mesma degradação da IA, do Google, do
// e-mail e da Stripe (§8).
//
// ⚠️ ENQUANTO A T-224 NÃO ACONTECER, QUEM COBRA EM PRODUÇÃO É A STRIPE.
// Preencher estas envs habilita o código novo para desenvolvimento; não troca o
// provedor de ninguém.
export const ASAAS_CLIENT = Symbol('ASAAS_CLIENT');

// Prefixos das chaves — servem só para AVISAR sobre ambiente trocado, nunca para
// bloquear (o dono pode ter motivo). Medido na T-209.
const PREFIXO_SANDBOX = '$aact_hmlg_';
const PREFIXO_PRODUCAO = '$aact_prod_';

export const AsaasClientProvider: Provider = {
  provide: ASAAS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): AsaasClient | null => {
    const logger = new Logger('AsaasClient');
    const chave = config.get<string>('ASAAS_API_KEY')?.trim();
    const baseUrl = config
      .get<string>('ASAAS_BASE_URL')
      ?.trim()
      .replace(/\/$/, '');

    if (!chave || !baseUrl) {
      logger.warn(
        'ASAAS_API_KEY/ASAAS_BASE_URL ausentes — cobrança pelo Asaas desabilitada (503).',
      );
      return null;
    }

    // ⚠️ Chave e host formam PAR. Trocar um dos dois falha com 401, e o 401 não
    // diz "ambiente errado" — foi por isso que este aviso existe (T-209). É o
    // tipo de erro que custa uma tarde para quem não foi avisado.
    const ehSandboxUrl = baseUrl.includes('sandbox');
    if (chave.startsWith(PREFIXO_SANDBOX) && !ehSandboxUrl) {
      logger.error(
        'Chave de SANDBOX ($aact_hmlg_) apontando para host de PRODUÇÃO — as chamadas vão falhar com 401.',
      );
    }
    if (chave.startsWith(PREFIXO_PRODUCAO) && ehSandboxUrl) {
      logger.error(
        'Chave de PRODUÇÃO ($aact_prod_) apontando para o SANDBOX — as chamadas vão falhar com 401.',
      );
    }
    if (ehSandboxUrl) {
      logger.warn('Asaas em SANDBOX — nenhuma cobrança é real.');
    }

    return new AsaasClient(baseUrl, chave, 'PrumoLicita');
  },
};
