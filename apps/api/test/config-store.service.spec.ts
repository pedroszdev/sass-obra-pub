import { Repository } from 'typeorm';
import { AppSetting } from '../src/config/app-setting.entity';
import {
  ConfigStoreService,
  OperationalBanner,
} from '../src/config/config-store.service';
import { TRIAL_DIAS } from '../src/assinaturas/acesso';

// Store de config operacional (T-195). O que os testes travam: o fallback e o
// CLAMP dos dias de trial (é caminho do dinheiro — um valor absurdo gravado por
// engano não pode passar), e o banner público (só quando ativo, com cache).

function build(rows: Record<string, unknown> = {}) {
  const store = { ...rows };
  const repo = {
    findOne: jest.fn(({ where }: { where: { key: string } }) =>
      Promise.resolve(
        store[where.key] !== undefined
          ? ({ key: where.key, value: store[where.key] } as AppSetting)
          : null,
      ),
    ),
    save: jest.fn((row: { key: string; value: unknown }) => {
      store[row.key] = row.value;
      return Promise.resolve(row as AppSetting);
    }),
  } as unknown as Repository<AppSetting>;
  return { service: new ConfigStoreService(repo), store };
}

describe('ConfigStoreService (T-195)', () => {
  it('getTrialDias cai no default 7 sem registro', async () => {
    const { service } = build();
    expect(await service.getTrialDias()).toBe(TRIAL_DIAS);
  });

  it('getTrialDias faz clamp de valor gravado fora de 1–90', async () => {
    expect(await build({ trial_dias: 0 }).service.getTrialDias()).toBe(1);
    expect(await build({ trial_dias: 1000 }).service.getTrialDias()).toBe(90);
    expect(await build({ trial_dias: 14 }).service.getTrialDias()).toBe(14);
  });

  it('setTrialDias grava com clamp', async () => {
    const { service, store } = build();
    expect(await service.setTrialDias(999, 'admin1')).toBe(90);
    expect(store.trial_dias).toBe(90);
  });

  it('getBannerPublico é null quando inativo, e o banner quando ativo', async () => {
    const inativo: OperationalBanner = {
      ativo: false,
      nivel: 'info',
      mensagem: 'x',
    };
    expect(
      await build({ operational_banner: inativo }).service.getBannerPublico(),
    ).toBeNull();

    const ativo: OperationalBanner = {
      ativo: true,
      nivel: 'critico',
      mensagem: 'Manutenção às 22h',
    };
    expect(
      await build({ operational_banner: ativo }).service.getBannerPublico(),
    ).toEqual(ativo);
  });

  it('setBanner invalida o cache (a mudança aparece na hora)', async () => {
    const { service } = build();
    expect(await service.getBannerPublico()).toBeNull(); // default inativo, agora em cache
    await service.setBanner(
      { ativo: true, nivel: 'aviso', mensagem: 'Incidente' },
      'admin1',
    );
    expect(await service.getBannerPublico()).toMatchObject({ ativo: true });
  });
});
