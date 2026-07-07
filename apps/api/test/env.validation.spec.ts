import { validateEnv } from '../src/common/env.validation';

// Base com os segredos sempre-obrigatórios preenchidos.
const comSegredos = (extra: Record<string, unknown> = {}) => ({
  JWT_ACCESS_SECRET: 'acc',
  JWT_REFRESH_SECRET: 'ref',
  ...extra,
});

describe('validateEnv (T-104)', () => {
  it('passa quando os segredos de JWT estão preenchidos (dev)', () => {
    const cfg = comSegredos();
    expect(validateEnv(cfg)).toBe(cfg); // devolve o próprio config
  });

  it('falha se faltar JWT_ACCESS_SECRET', () => {
    expect(() => validateEnv({ JWT_REFRESH_SECRET: 'ref' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('falha se faltar JWT_REFRESH_SECRET', () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: 'acc' })).toThrow(
      /JWT_REFRESH_SECRET/,
    );
  });

  it('trata string vazia/espaços como ausente', () => {
    expect(() =>
      validateEnv({ JWT_ACCESS_SECRET: '  ', JWT_REFRESH_SECRET: 'ref' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('em produção exige DATABASE_HOST/DATABASE_PASSWORD/WEB_ORIGIN', () => {
    expect(() => validateEnv(comSegredos({ NODE_ENV: 'production' }))).toThrow(
      /DATABASE_HOST, DATABASE_PASSWORD, WEB_ORIGIN/,
    );
  });

  it('em produção passa quando tudo está setado', () => {
    const cfg = comSegredos({
      NODE_ENV: 'production',
      DATABASE_HOST: 'db.render',
      DATABASE_PASSWORD: 's3nha',
      WEB_ORIGIN: 'https://app.prumolicita.com.br',
    });
    expect(validateEnv(cfg)).toBe(cfg);
  });

  it('fora de produção NÃO exige as de banco/CORS (defaults de dev valem)', () => {
    const cfg = comSegredos({ NODE_ENV: 'development' });
    expect(() => validateEnv(cfg)).not.toThrow();
  });
});
