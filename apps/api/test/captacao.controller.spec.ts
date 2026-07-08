import {
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CaptacaoController } from '../src/captacao/captacao.controller';
import { CaptacaoJobService } from '../src/captacao/captacao-job.service';
import { IaCustoService } from '../src/editais/ia-custo.service';

const TOKEN = 'segredo-de-captacao';

describe('CaptacaoController', () => {
  let controller: CaptacaoController;
  const jobMock = { runOnce: jest.fn() };
  const configMock = { get: jest.fn() };
  const iaCustoMock = { resumo: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    configMock.get.mockReturnValue(TOKEN);
    jobMock.runOnce.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      controllers: [CaptacaoController],
      providers: [
        { provide: CaptacaoJobService, useValue: jobMock },
        { provide: ConfigService, useValue: configMock },
        { provide: IaCustoService, useValue: iaCustoMock },
      ],
    }).compile();

    controller = moduleRef.get(CaptacaoController);
  });

  it('503 quando o token não está configurado', () => {
    configMock.get.mockReturnValue(undefined);
    expect(() => controller.run(TOKEN)).toThrow(ServiceUnavailableException);
    expect(jobMock.runOnce).not.toHaveBeenCalled();
  });

  it('401 quando o token é inválido ou ausente', () => {
    expect(() => controller.run('errado')).toThrow(UnauthorizedException);
    expect(() => controller.run(undefined)).toThrow(UnauthorizedException);
    expect(jobMock.runOnce).not.toHaveBeenCalled();
  });

  it('aceita (202) e dispara a captação com o token correto', () => {
    expect(controller.run(TOKEN)).toEqual({ status: 'accepted' });
    expect(jobMock.runOnce).toHaveBeenCalledTimes(1);
  });

  it('409 quando já há uma captação em execução', () => {
    // runOnce pendente → a flag `running` permanece ligada.
    let resolveRun: () => void = () => {};
    jobMock.runOnce.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRun = resolve;
      }),
    );

    expect(controller.run(TOKEN)).toEqual({ status: 'accepted' });
    expect(() => controller.run(TOKEN)).toThrow(ConflictException);
    expect(jobMock.runOnce).toHaveBeenCalledTimes(1);

    resolveRun();
  });
});
