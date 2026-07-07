import { Repository } from 'typeorm';
import { RefreshToken } from '../src/auth/refresh-token.entity';
import { RefreshTokenCleanupService } from '../src/auth/refresh-token-cleanup.service';

describe('RefreshTokenCleanupService (T-104)', () => {
  let service: RefreshTokenCleanupService;
  let execute: jest.Mock;
  let qb: {
    delete: jest.Mock;
    where: jest.Mock;
    orWhere: jest.Mock;
    execute: jest.Mock;
  };
  let repo: { createQueryBuilder: jest.Mock };

  beforeEach(() => {
    execute = jest.fn().mockResolvedValue({ affected: 3 });
    qb = {
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      execute,
    };
    repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    service = new RefreshTokenCleanupService(
      repo as unknown as Repository<RefreshToken>,
    );
  });

  it('apaga expirados (por now) OU revogados fora da graça de 24h', async () => {
    const now = new Date('2026-07-07T12:00:00Z');
    const removidos = await service.purgar(now);

    expect(qb.where).toHaveBeenCalledWith('expires_at < :now', { now });
    expect(qb.orWhere).toHaveBeenCalledWith(
      '(revoked = true AND created_at < :graca)',
      { graca: new Date('2026-07-06T12:00:00Z') },
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(removidos).toBe(3);
  });

  it('retorna 0 quando não havia nada a apagar', async () => {
    execute.mockResolvedValueOnce({ affected: 0 });
    expect(await service.purgar(new Date())).toBe(0);
  });

  it('no boot, um erro de banco NÃO derruba a aplicação', async () => {
    execute.mockRejectedValueOnce(new Error('DB caiu'));
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
