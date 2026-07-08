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
