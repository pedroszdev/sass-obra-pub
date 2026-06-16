import { Test } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from '../src/health/health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const healthMock = { check: jest.fn().mockResolvedValue({ status: 'ok' }) };
  const dbMock = { pingCheck: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthMock },
        { provide: TypeOrmHealthIndicator, useValue: dbMock },
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
});
