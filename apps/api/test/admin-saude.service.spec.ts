import { ConfigService } from '@nestjs/config';
import { AdminSaudeService } from '../src/admin/admin-saude.service';

// Saúde das integrações + sanidade de env (T-201). O que trava: os flags de
// "configurado" batem com a presença dos envs, e o retorno NUNCA carrega o
// VALOR de um segredo — só nome + presença.

function build(envs: Record<string, string>) {
  const config = {
    get: jest.fn((k: string) => envs[k]),
  } as unknown as ConfigService;
  return new AdminSaudeService(config);
}

describe('AdminSaudeService.estado (T-201)', () => {
  it('marca as integrações configuradas conforme os envs presentes', () => {
    const s = build({
      JWT_ACCESS_SECRET: 'a',
      JWT_REFRESH_SECRET: 'b',
      WEB_ORIGIN: 'https://app.x',
      OPENAI_API_KEY: 'sk-xxx',
      STRIPE_SECRET_KEY: 'rk_x',
      STRIPE_WEBHOOK_SECRET: 'whsec',
    }).estado();

    const nucleo = s.integracoes.find((i) => i.nome.startsWith('Núcleo'));
    const openai = s.integracoes.find((i) => i.nome.startsWith('OpenAI'));
    const google = s.integracoes.find((i) => i.nome.startsWith('Login'));
    const stripe = s.integracoes.find((i) => i.nome.startsWith('Stripe'));

    expect(nucleo?.configurado).toBe(true);
    expect(openai?.configurado).toBe(true);
    expect(stripe?.configurado).toBe(true);
    expect(google?.configurado).toBe(false); // GOOGLE_CLIENT_ID ausente
  });

  it('e-mail configurado por Resend OU SMTP', () => {
    const soSmtp = build({ SMTP_HOST: 'smtp.x' }).estado();
    const email = soSmtp.integracoes.find((i) => i.nome.startsWith('E-mail'));
    expect(email?.configurado).toBe(true);
  });

  it('trata env vazio/espaços como ausente', () => {
    const s = build({ OPENAI_API_KEY: '   ' }).estado();
    const openai = s.integracoes.find((i) => i.nome.startsWith('OpenAI'));
    expect(openai?.configurado).toBe(false);
    const envOpenai = s.envs.find((e) => e.nome === 'OPENAI_API_KEY');
    expect(envOpenai?.presente).toBe(false);
  });

  it('SEGURANÇA: o retorno não contém nenhum VALOR de env — só nome + presença', () => {
    const segredo = 'sk-super-secreto-123';
    const s = build({
      OPENAI_API_KEY: segredo,
      STRIPE_SECRET_KEY: 'rk_live_zzz',
    }).estado();
    const serial = JSON.stringify(s);
    expect(serial).not.toContain(segredo);
    expect(serial).not.toContain('rk_live_zzz');
    // cada env tem só as chaves esperadas (sem 'valor'/'value')
    for (const e of s.envs) {
      expect(Object.keys(e).sort()).toEqual(
        ['grupo', 'nome', 'obrigatorioEmProd', 'presente'].sort(),
      );
    }
  });

  it('lista os envs do catálogo com grupo e obrigatoriedade', () => {
    const s = build({}).estado();
    const web = s.envs.find((e) => e.nome === 'WEB_ORIGIN');
    expect(web).toMatchObject({ grupo: 'Núcleo', obrigatorioEmProd: true });
    const adminAlert = s.envs.find((e) => e.nome === 'ADMIN_ALERT_EMAIL');
    expect(adminAlert?.grupo).toBe('Alertas');
  });
});
