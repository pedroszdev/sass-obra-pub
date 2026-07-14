import { Test } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { CaptacaoHealthIndicator } from '../src/health/captacao.health';
import { HealthController } from '../src/health/health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const healthMock = { check: jest.fn().mockResolvedValue({ status: 'ok' }) };
  const dbMock = { pingCheck: jest.fn() };
  const captacaoMock = { check: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthMock },
        { provide: TypeOrmHealthIndicator, useValue: dbMock },
        { provide: CaptacaoHealthIndicator, useValue: captacaoMock },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('check() delega ao HealthCheckService e devolve o status', async () => {
    await expect(controller.check()).resolves.toEqual({ status: 'ok' });
    expect(healthMock.check).toHaveBeenCalledTimes(1);
  });

  // T-106: servidor de pé NÃO é pipeline viva. O /health/captacao inclui o
  // indicador de domínio, que é onde o monitor externo deve bater.
  it('check da captação inclui banco E o indicador de domínio', async () => {
    await expect(controller.checkCaptacao()).resolves.toEqual({ status: 'ok' });
    const indicadores = healthMock.check.mock.calls.at(-1)?.[0] as unknown[];
    expect(indicadores).toHaveLength(2);
  });
});
