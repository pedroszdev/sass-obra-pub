import { Repository } from 'typeorm';
import { AdminBroadcastService } from '../src/admin/admin-broadcast.service';
import { BetaBroadcast } from '../src/admin/beta-broadcast.entity';
import { MailService } from '../src/mail/mail.service';
import { emailComunicado } from '../src/mail/mail.templates';
import { User } from '../src/users/user.entity';

// Comunicado ao beta (T-198): o segmento resolve os destinatários certos, cada um
// recebe UM e-mail com o assunto do admin, e o corpo é ESCAPADO (não vira HTML).

function buildQb(destinatarios: { email: string; name: string }[]) {
  const chamadas: { join?: string; where: Record<string, unknown> } = {
    where: {},
  };
  const qb = {
    select: () => qb,
    where: () => qb,
    innerJoin: (_t: string, alias: string) => {
      chamadas.join = alias;
      return qb;
    },
    andWhere: (_s: string, params: Record<string, unknown>) => {
      Object.assign(chamadas.where, params);
      return qb;
    },
    getRawMany: () => Promise.resolve(destinatarios),
  };
  return { qb, chamadas };
}

function build(destinatarios: { email: string; name: string }[]) {
  const { qb, chamadas } = buildQb(destinatarios);
  const users = {
    createQueryBuilder: () => qb,
  } as unknown as Repository<User>;
  const saved: BetaBroadcast[] = [];
  const broadcasts = {
    create: (x: Partial<BetaBroadcast>) => x as BetaBroadcast,
    save: (x: BetaBroadcast) => {
      const row = { ...x, id: 'b1' } as BetaBroadcast;
      saved.push(row);
      return Promise.resolve(row);
    },
    update: jest.fn().mockResolvedValue(undefined),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  } as unknown as Repository<BetaBroadcast>;
  const mail = {
    sendMail: jest.fn().mockResolvedValue(undefined),
  } as unknown as MailService;
  const service = new AdminBroadcastService(broadcasts, users, mail);
  return { service, mail, broadcasts, saved, chamadas };
}

// pequena espera para o envio em segundo plano (fire-and-forget) rodar
const flush = () => new Promise((r) => setImmediate(r));

describe('AdminBroadcastService (T-198)', () => {
  it('preview conta os destinatários do segmento (trial filtra por status)', async () => {
    const { service, chamadas } = build([
      { email: 'a@x.com', name: 'A' },
      { email: 'b@x.com', name: 'B' },
    ]);
    expect(await service.preview('trial')).toEqual({ total: 2 });
    expect(chamadas.join).toBe('a'); // fez join com assinaturas
    expect(chamadas.where).toMatchObject({ status: 'trialing' });
  });

  it('segmento "todos" não filtra por status (sem join)', async () => {
    const { service, chamadas } = build([{ email: 'a@x.com', name: 'A' }]);
    await service.preview('todos');
    expect(chamadas.join).toBeUndefined();
  });

  it('enviar registra a campanha e manda 1 e-mail por destinatário com o assunto', async () => {
    const { service, mail, saved } = build([
      { email: 'a@x.com', name: 'A' },
      { email: 'b@x.com', name: 'B' },
    ]);
    const campanha = await service.enviar(
      { segmento: 'todos', assunto: 'Novidade', corpo: 'Olá pessoal' },
      'admin1',
    );
    expect(campanha.total).toBe(2);
    expect(saved[0].status).toBe('enviando');
    await flush();
    expect(mail.sendMail as jest.Mock).toHaveBeenCalledTimes(2);
    expect((mail.sendMail as jest.Mock).mock.calls[0][0]).toMatchObject({
      to: 'a@x.com',
      subject: 'Novidade',
    });
  });
});

describe('emailComunicado (T-198)', () => {
  it('escapa o corpo — HTML no texto não vira markup', () => {
    const { html, text } = emailComunicado(
      '<script>alert(1)</script>\nlinha 2',
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('linha 2');
    expect(text).toContain('<script>'); // o text é o corpo cru (não é HTML)
  });
});
