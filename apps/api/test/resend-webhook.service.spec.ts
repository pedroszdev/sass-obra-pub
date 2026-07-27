import { Repository } from 'typeorm';
import { MailLog } from '../src/mail/mail-log.entity';
import {
  ResendEvent,
  ResendWebhookService,
} from '../src/mail/resend-webhook.service';

// Processamento do webhook de entrega do Resend (T-193): o evento casa com a
// linha de envio pelo provider_message_id e carimba o status de entrega.

function build(linha: Partial<MailLog> | null) {
  const repo = {
    findOne: jest.fn().mockResolvedValue(linha),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  } as unknown as Repository<MailLog>;
  const service = new ResendWebhookService(repo);
  return { service, repo };
}

const evento = (
  type: string,
  emailId = 'msg_1',
  extra: Record<string, unknown> = {},
): ResendEvent => ({
  type,
  created_at: '2026-07-27T12:00:00Z',
  data: { email_id: emailId, ...extra },
});

describe('ResendWebhookService (T-193)', () => {
  it('email.delivered → grava entregue na linha', async () => {
    const { service, repo } = build({ deliveryStatus: null });
    const r = await service.processar(evento('email.delivered'));
    expect(r.status).toBe('aplicado');
    expect(repo.update).toHaveBeenCalledWith(
      { providerMessageId: 'msg_1' },
      expect.objectContaining({ deliveryStatus: 'entregue' }),
    );
  });

  it('email.bounced → grava bounce com detalhe', async () => {
    const { service, repo } = build({ deliveryStatus: null });
    const r = await service.processar(
      evento('email.bounced', 'msg_1', { bounce: { message: 'mailbox full' } }),
    );
    expect(r.status).toBe('aplicado');
    expect(repo.update).toHaveBeenCalledWith(
      { providerMessageId: 'msg_1' },
      expect.objectContaining({
        deliveryStatus: 'bounce',
        deliveryDetalhe: 'mailbox full',
      }),
    );
  });

  it('bounce NÃO é sobrescrito por delivered posterior (fora de ordem)', async () => {
    const { service, repo } = build({ deliveryStatus: 'bounce' });
    const r = await service.processar(evento('email.delivered'));
    expect(r.status).toBe('ignorado');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('delivered duplicado → no-op (idempotência)', async () => {
    const { service, repo } = build({ deliveryStatus: 'entregue' });
    const r = await service.processar(evento('email.delivered'));
    expect(r.status).toBe('ignorado');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('bounce SOBRESCREVE entregue anterior', async () => {
    const { service, repo } = build({ deliveryStatus: 'entregue' });
    const r = await service.processar(evento('email.bounced'));
    expect(r.status).toBe('aplicado');
    expect(repo.update).toHaveBeenCalled();
  });

  it('tipo desconhecido → ignorado, sem tocar o banco', async () => {
    const { service, repo } = build({ deliveryStatus: null });
    const r = await service.processar(evento('email.opened'));
    expect(r.status).toBe('ignorado');
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('message id sem correspondência → sem_correspondencia', async () => {
    const { service, repo } = build(null);
    const r = await service.processar(evento('email.delivered', 'inexistente'));
    expect(r.status).toBe('sem_correspondencia');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('sem email_id → ignorado', async () => {
    const { service } = build({ deliveryStatus: null });
    const r = await service.processar({
      type: 'email.delivered',
      data: {},
    });
    expect(r.status).toBe('ignorado');
  });
});
