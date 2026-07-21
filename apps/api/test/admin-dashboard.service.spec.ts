import { Repository } from 'typeorm';
import { AdminDashboardService } from '../src/admin/admin-dashboard.service';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { AssinaturaStatus } from '../src/assinaturas/assinatura-status.enum';
import { Edital } from '../src/editais/edital.entity';
import { NotificationLog } from '../src/notificacoes/notification-log.entity';
import { User } from '../src/users/user.entity';

// Home do admin (T-194). O service dispara vários counts + a lista de trials
// expirando; o teste confirma que cada número vai para o campo certo e que a
// lista de "quem ligar" ganha o e-mail.

const NOW = new Date('2026-07-14T12:00:00Z');

describe('AdminDashboardService.resumo (T-194)', () => {
  it('monta o resumo com contagens por status e a lista de trials expirando', async () => {
    // count devolve por status conforme o where recebido.
    const assinaturas = {
      count: jest.fn((opts: { where: { status: AssinaturaStatus } }) => {
        const mapa: Record<string, number> = {
          [AssinaturaStatus.ACTIVE]: 4,
          [AssinaturaStatus.TRIALING]: 9,
          [AssinaturaStatus.PAST_DUE]: 1,
          [AssinaturaStatus.CANCELED]: 2,
        };
        return Promise.resolve(mapa[opts.where.status]);
      }),
      find: jest.fn().mockResolvedValue([
        { userId: 'u1', trialEndsAt: new Date('2026-07-15T10:00:00Z') },
        { userId: 'u2', trialEndsAt: new Date('2026-07-16T09:00:00Z') },
      ]),
    } as unknown as Repository<Assinatura>;

    const users = {
      // 1ª chamada = cadastros hoje; 2ª = últimos 7d.
      count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(11),
      find: jest.fn().mockResolvedValue([
        { id: 'u1', email: 'a@x.com' },
        { id: 'u2', email: 'b@x.com' },
      ]),
    } as unknown as Repository<User>;

    const editais = {
      count: jest.fn().mockResolvedValue(20),
    } as unknown as Repository<Edital>;

    const notificacoes = {
      count: jest.fn().mockResolvedValue(5),
    } as unknown as Repository<NotificationLog>;

    const service = new AdminDashboardService(
      assinaturas,
      users,
      editais,
      notificacoes,
    );

    const r = await service.resumo(NOW);

    expect(r.assinaturas).toEqual({
      pagantes: 4,
      emTrial: 9,
      pastDue: 1,
      canceladas: 2,
    });
    expect(r.cadastros).toEqual({ hoje: 3, ultimos7d: 11 });
    expect(r.produto).toEqual({ editaisHoje: 20, alertasHoje: 5 });
    expect(r.trialsExpirando.total).toBe(2);
    expect(r.trialsExpirando.contas[0]).toEqual({
      id: 'u1',
      email: 'a@x.com',
      trialEndsAt: new Date('2026-07-15T10:00:00Z'),
    });
  });

  it('lista de trials vazia não busca e-mails', async () => {
    const assinaturas = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<Assinatura>;
    const users = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn(),
    } as unknown as Repository<User>;
    const service = new AdminDashboardService(
      assinaturas,
      users,
      {
        count: jest.fn().mockResolvedValue(0),
      } as unknown as Repository<Edital>,
      {
        count: jest.fn().mockResolvedValue(0),
      } as unknown as Repository<NotificationLog>,
    );

    const r = await service.resumo(NOW);
    expect(r.trialsExpirando.contas).toEqual([]);
    expect(users.find).not.toHaveBeenCalled();
  });
});
