import { ConfigService } from '@nestjs/config';
import { MailService } from '../src/mail/mail.service';

function build(env: Record<string, string> = {}) {
  const config = {
    get: jest.fn((k: string, def?: unknown) => env[k] ?? def),
  };
  return new MailService(config as unknown as ConfigService);
}

describe('MailService (T-101)', () => {
  it('sem SMTP_HOST → log-only, não lança', async () => {
    const service = build(); // sem env
    await expect(
      service.sendMail({ to: 'a@b.com', subject: 'Oi', html: '<p>oi</p>' }),
    ).resolves.toBeUndefined();
  });

  it('falha de envio não propaga (best-effort — não vaza pelo timing)', async () => {
    const service = build({ SMTP_HOST: 'smtp.exemplo.com' });
    // Força o transporter a falhar no envio.
    const transporter = {
      sendMail: jest.fn().mockRejectedValue(new Error('smtp down')),
    };
    (service as unknown as { transporter: unknown }).transporter = transporter;
    await expect(
      service.sendMail({ to: 'a@b.com', subject: 'Oi', html: '<p>oi</p>' }),
    ).resolves.toBeUndefined();
    expect(transporter.sendMail).toHaveBeenCalledTimes(1);
  });
});

// O Render bloqueia a saída nas portas de SMTP (25/465/587) no plano free desde
// set/2025: por SMTP o e-mail NÃO SAI de lá ("Connection timeout"), com host e
// credencial corretos. Por isso produção fala com a Resend por HTTPS (443).
describe('MailService — envio por HTTPS (Resend)', () => {
  const fetchMock = jest.fn();
  const original = global.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = original;
  });

  const ok = () =>
    Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') });

  it('com RESEND_API_KEY → POST na API, com a chave e o remetente', async () => {
    fetchMock.mockReturnValue(ok());
    const service = build({
      RESEND_API_KEY: 're_chave',
      MAIL_FROM: 'PrumoLicita <nao-responda@prumolicita.com.br>',
    });

    await service.sendMail({
      to: 'a@b.com',
      subject: 'Oi',
      html: '<p>oi</p>',
      text: 'oi',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_chave');
    const corpo = JSON.parse(init.body) as Record<string, unknown>;
    expect(corpo.to).toEqual(['a@b.com']);
    expect(corpo.from).toBe('PrumoLicita <nao-responda@prumolicita.com.br>');
    expect(corpo.subject).toBe('Oi');
  });

  // A chave HTTP tem precedência: é o caminho que funciona no Render free, mesmo
  // que sobrem variáveis de SMTP no ambiente (é o caso hoje).
  it('RESEND_API_KEY vence o SMTP quando os dois estão configurados', async () => {
    fetchMock.mockReturnValue(ok());
    const service = build({
      RESEND_API_KEY: 're_chave',
      SMTP_HOST: 'smtp.resend.com',
    });
    const transporter = { sendMail: jest.fn() };
    (service as unknown as { transporter: unknown }).transporter = transporter;

    await service.sendMail({ to: 'a@b.com', subject: 'Oi', html: '<p>oi</p>' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(transporter.sendMail).not.toHaveBeenCalled();
  });

  // Domínio não verificado / chave inválida: a Resend responde 4xx com o motivo
  // no corpo. Precisa virar log, nunca exceção que suba pro fluxo de cadastro.
  it('erro da API não propaga (fica no log)', async () => {
    fetchMock.mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 403,
        text: () => Promise.resolve('domain is not verified'),
      }),
    );
    const service = build({ RESEND_API_KEY: 're_chave' });

    await expect(
      service.sendMail({ to: 'a@b.com', subject: 'Oi', html: '<p>oi</p>' }),
    ).resolves.toBeUndefined();
  });

  it('rede fora não propaga', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    const service = build({ RESEND_API_KEY: 're_chave' });

    await expect(
      service.sendMail({ to: 'a@b.com', subject: 'Oi', html: '<p>oi</p>' }),
    ).resolves.toBeUndefined();
  });
});
