import { Repository } from 'typeorm';
import { AssinaturasService } from '../src/assinaturas/assinaturas.service';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { ConfigStoreService } from '../src/config/config-store.service';

// iniciarTrial usa os dias configuráveis (T-195). O fim do trial é gravado como
// snapshot AGORA — mudar o parâmetro depois não mexe em trials já criados.
describe('AssinaturasService.iniciarTrial × dias configuráveis (T-195)', () => {
  it('grava trialEndsAt com os dias vindos do store', async () => {
    let valores: { trialEndsAt: Date } | undefined;
    const qb = {
      insert: () => qb,
      values: (v: { trialEndsAt: Date }) => {
        valores = v;
        return qb;
      },
      orIgnore: () => qb,
      execute: () => Promise.resolve(undefined),
    };
    const repo = {
      createQueryBuilder: () => qb,
    } as unknown as Repository<Assinatura>;
    const config = {
      getTrialDias: jest.fn().mockResolvedValue(14),
    } as unknown as ConfigStoreService;

    const service = new AssinaturasService(repo, config);
    const now = new Date('2026-07-23T00:00:00.000Z');
    await service.iniciarTrial('u1', now);

    expect(config.getTrialDias).toHaveBeenCalled();
    // 14 dias após `now`.
    expect(valores?.trialEndsAt.toISOString()).toBe('2026-08-06T00:00:00.000Z');
  });
});
