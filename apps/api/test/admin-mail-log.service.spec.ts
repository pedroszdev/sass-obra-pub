import { ILike, Repository } from 'typeorm';
import { AdminMailLogService } from '../src/admin/admin-mail-log.service';
import { MailLog } from '../src/mail/mail-log.entity';

// Leitura do log de e-mails (T-193): filtro por e-mail (ILIKE) e status.
function build() {
  const repo = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  } as unknown as Repository<MailLog>;
  return { service: new AdminMailLogService(repo), repo };
}

describe('AdminMailLogService.listar (T-193)', () => {
  it('sem filtro: where vazio', async () => {
    const { service, repo } = build();
    await service.listar({ page: 1 });
    expect((repo.findAndCount as jest.Mock).mock.calls[0][0].where).toEqual({});
  });

  it('filtra por e-mail (ILIKE) e status', async () => {
    const { service, repo } = build();
    await service.listar({ email: 'fulano', status: 'falhou', page: 2 });
    const arg = (repo.findAndCount as jest.Mock).mock.calls[0][0];
    expect(arg.where).toEqual({ para: ILike('%fulano%'), status: 'falhou' });
    expect(arg.skip).toBe(20);
  });
});
