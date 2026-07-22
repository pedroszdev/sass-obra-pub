import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Grupos do catálogo de env.
type Grupo =
  | 'Núcleo'
  | 'Banco'
  | 'IA'
  | 'E-mail'
  | 'Stripe'
  | 'Google'
  | 'Observabilidade'
  | 'Ops'
  | 'Alertas'
  | 'Retenção';

interface EnvSpec {
  nome: string;
  grupo: Grupo;
  obrigatorioEmProd: boolean;
}

// Catálogo dos envs que o código lê (CLAUDE.md §8/T-163). Só NOMES — o valor
// nunca sai daqui.
const CATALOGO: EnvSpec[] = [
  { nome: 'JWT_ACCESS_SECRET', grupo: 'Núcleo', obrigatorioEmProd: true },
  { nome: 'JWT_REFRESH_SECRET', grupo: 'Núcleo', obrigatorioEmProd: true },
  { nome: 'WEB_ORIGIN', grupo: 'Núcleo', obrigatorioEmProd: true },
  { nome: 'DATABASE_HOST', grupo: 'Banco', obrigatorioEmProd: true },
  { nome: 'DATABASE_PASSWORD', grupo: 'Banco', obrigatorioEmProd: true },
  { nome: 'DATABASE_PORT', grupo: 'Banco', obrigatorioEmProd: false },
  { nome: 'DATABASE_USER', grupo: 'Banco', obrigatorioEmProd: false },
  { nome: 'DATABASE_NAME', grupo: 'Banco', obrigatorioEmProd: false },
  { nome: 'OPENAI_API_KEY', grupo: 'IA', obrigatorioEmProd: false },
  { nome: 'IA_BUDGET_DAILY_USD', grupo: 'IA', obrigatorioEmProd: false },
  { nome: 'IA_BUDGET_MONTHLY_USD', grupo: 'IA', obrigatorioEmProd: false },
  { nome: 'RESEND_API_KEY', grupo: 'E-mail', obrigatorioEmProd: false },
  { nome: 'MAIL_FROM', grupo: 'E-mail', obrigatorioEmProd: false },
  { nome: 'SMTP_HOST', grupo: 'E-mail', obrigatorioEmProd: false },
  { nome: 'STRIPE_SECRET_KEY', grupo: 'Stripe', obrigatorioEmProd: false },
  { nome: 'STRIPE_WEBHOOK_SECRET', grupo: 'Stripe', obrigatorioEmProd: false },
  { nome: 'STRIPE_PRICE_ID', grupo: 'Stripe', obrigatorioEmProd: false },
  { nome: 'STRIPE_PRICE_ID_ANUAL', grupo: 'Stripe', obrigatorioEmProd: false },
  { nome: 'GOOGLE_CLIENT_ID', grupo: 'Google', obrigatorioEmProd: false },
  { nome: 'SENTRY_DSN', grupo: 'Observabilidade', obrigatorioEmProd: false },
  { nome: 'CAPTACAO_TRIGGER_TOKEN', grupo: 'Ops', obrigatorioEmProd: false },
  { nome: 'ADMIN_ALERT_EMAIL', grupo: 'Alertas', obrigatorioEmProd: false },
  {
    nome: 'EXCLUSAO_INATIVOS_DIAS',
    grupo: 'Retenção',
    obrigatorioEmProd: false,
  },
  { nome: 'RETENCAO_DIAS', grupo: 'Retenção', obrigatorioEmProd: false },
];

export interface EnvStatus {
  nome: string;
  grupo: string;
  presente: boolean;
  obrigatorioEmProd: boolean;
}

export interface IntegracaoStatus {
  nome: string;
  configurado: boolean;
  obrigatorio: boolean;
  degrada: string;
}

export interface SaudeIntegracoes {
  producao: boolean;
  integracoes: IntegracaoStatus[];
  // Só NOMES + presença — nunca o valor de nenhum env (regra de segurança T-201).
  envs: EnvStatus[];
}

// Saúde das integrações + sanidade de env (T-201). Desarma a armadilha do §8/
// T-163: reprovisionar pelo render.yaml sobe "verde e morto" (CORS em localhost,
// callback do Google e success_url da Stripe apontando pra localhost) e o sintoma
// não aponta pra causa. Aqui a causa aparece em segundos.
//
// ⚠️ NUNCA expõe o VALOR de um env — só presença/ausência. É leitura de infra.
@Injectable()
export class AdminSaudeService {
  constructor(private readonly config: ConfigService) {}

  estado(): SaudeIntegracoes {
    const tem = (nome: string): boolean => {
      const v = this.config.get<string>(nome);
      return typeof v === 'string' && v.trim().length > 0;
    };

    const producao = this.config.get<string>('NODE_ENV') === 'production';

    const integracoes: IntegracaoStatus[] = [
      {
        nome: 'Núcleo (auth + CORS)',
        configurado:
          tem('JWT_ACCESS_SECRET') &&
          tem('JWT_REFRESH_SECRET') &&
          tem('WEB_ORIGIN'),
        obrigatorio: true,
        degrada:
          'Sem WEB_ORIGIN o CORS cai em localhost e o front real é rejeitado (T-163).',
      },
      {
        nome: 'Banco',
        configurado: tem('DATABASE_HOST') && tem('DATABASE_PASSWORD'),
        obrigatorio: true,
        degrada:
          'Sem host/senha em prod, cai nos defaults de dev (banco errado).',
      },
      {
        nome: 'OpenAI (IA)',
        configurado: tem('OPENAI_API_KEY'),
        obrigatorio: false,
        degrada: 'Ausente: resumo/extração/diagnóstico respondem 503.',
      },
      {
        nome: 'E-mail (Resend)',
        configurado: tem('RESEND_API_KEY') || tem('SMTP_HOST'),
        obrigatorio: false,
        degrada:
          'Ausente: e-mails só são logados (verificação/alertas não saem).',
      },
      {
        nome: 'Stripe (cobrança)',
        configurado: tem('STRIPE_SECRET_KEY') && tem('STRIPE_WEBHOOK_SECRET'),
        obrigatorio: false,
        degrada:
          'Ausente: cobrança em 503; sem webhook secret ninguém vira ativo.',
      },
      {
        nome: 'Login com Google',
        configurado: tem('GOOGLE_CLIENT_ID'),
        obrigatorio: false,
        degrada: 'Ausente: botão do Google some e /auth/google responde 503.',
      },
      {
        nome: 'Sentry',
        configurado: tem('SENTRY_DSN'),
        obrigatorio: false,
        degrada: 'Ausente: erros não são reportados (SDK inerte).',
      },
      {
        nome: 'Alerta de pipeline',
        configurado: tem('ADMIN_ALERT_EMAIL'),
        obrigatorio: false,
        degrada:
          'Ausente: pipeline quebrado só loga, não avisa por e-mail (T-189).',
      },
    ];

    const envs: EnvStatus[] = CATALOGO.map((e) => ({
      nome: e.nome,
      grupo: e.grupo,
      presente: tem(e.nome),
      obrigatorioEmProd: e.obrigatorioEmProd,
    }));

    return { producao, integracoes, envs };
  }
}
