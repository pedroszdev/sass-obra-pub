import { ConfigService } from '@nestjs/config';
import { MailLogService } from '../src/mail/mail-log.service';
import { MailService } from '../src/mail/mail.service';

// Instrumentação do log de e-mails (T-193): o MailService registra cada envio.
// Testa o caminho log-only (determinístico) — status 'log', provedor 'log'.

describe('MailService → MailLog (T-193)', () => {
  it('registra o envio (log-only) com para/assunto/status', async () => {
    const config = {
      get: jest.fn((k: string, def?: unknown) => def),
    } as unknown as ConfigService;
    const mailLog = {
      registrar: jest.fn().mockResolvedValue(undefined),
    } as unknown as MailLogService;
    const service = new MailService(config, mailLog);

    await service.sendMail({
      to: 'fulano@empresa.com',
      subject: 'Confirme seu e-mail',
      html: '<p>oi</p>',
    });

    expect(mailLog.registrar).toHaveBeenCalledWith({
      para: 'fulano@empresa.com',
      assunto: 'Confirme seu e-mail',
      provedor: 'log',
      status: 'log',
      erro: null,
      providerMessageId: null,
    });
  });

  it('sem MailLogService (opcional) não quebra', async () => {
    const config = {
      get: jest.fn((k: string, def?: unknown) => def),
    } as unknown as ConfigService;
    const service = new MailService(config);
    await expect(
      service.sendMail({ to: 'a@b.com', subject: 'Oi', html: '<p>x</p>' }),
    ).resolves.toBeUndefined();
  });

  it('caminho Resend captura o id da mensagem no log (T-193)', async () => {
    const config = {
      get: jest.fn((k: string, def?: unknown) =>
        k === 'RESEND_API_KEY' ? 're_test_key' : def,
      ),
    } as unknown as ConfigService;
    const mailLog = {
      registrar: jest.fn().mockResolvedValue(undefined),
    } as unknown as MailLogService;
    const service = new MailService(config, mailLog);

    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'msg_abc123' }), { status: 200 }),
      );

    await service.sendMail({ to: 'a@b.com', subject: 'Oi', html: '<p>x</p>' });

    expect(mailLog.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        provedor: 'resend',
        status: 'enviado',
        providerMessageId: 'msg_abc123',
      }),
    );
    fetchMock.mockRestore();
  });
});
