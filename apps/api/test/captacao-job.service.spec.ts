import { CaptacaoJobService } from '../src/captacao/captacao-job.service';
import { ExigenciasService } from '../src/editais/exigencias/exigencias.service';
import { UfCaptureService } from '../src/editais/uf-capture.service';
import { UsersService } from '../src/users/users.service';

// O job virou um maestro fino (T-34): lê as UFs ativas e delega a captura de
// cada uma ao UfCaptureService. A lógica de backfill/incremental é testada em
// uf-capture.service.spec.ts. O job também dispara a pré-computação por IA (T-54)
// — só aqui, não na captação sob demanda da busca.
function makeService(ufs: string[]) {
  const capture = { captureUf: jest.fn().mockResolvedValue(undefined) };
  const users = { findDistinctUfs: jest.fn().mockResolvedValue(ufs) };
  const exigencias = {
    triggerPrecomputeUf: jest.fn().mockResolvedValue(true),
  };
  const service = new CaptacaoJobService(
    capture as unknown as UfCaptureService,
    users as unknown as UsersService,
    exigencias as unknown as ExigenciasService,
  );
  return { service, capture, users, exigencias };
}

describe('CaptacaoJobService.runOnce', () => {
  it('sem UFs ativas: não capta nada', async () => {
    const { service, capture } = makeService([]);

    await service.runOnce();

    expect(capture.captureUf).not.toHaveBeenCalled();
  });

  it('capta cada UF dos usuários ativos', async () => {
    const { service, capture } = makeService(['SC', 'PR']);

    await service.runOnce();

    expect(capture.captureUf).toHaveBeenCalledTimes(2);
    expect(capture.captureUf).toHaveBeenCalledWith('SC');
    expect(capture.captureUf).toHaveBeenCalledWith('PR');
  });

  it('dispara a pré-computação por IA de cada UF (T-54)', async () => {
    const { service, exigencias } = makeService(['SC', 'PR']);

    await service.runOnce();

    expect(exigencias.triggerPrecomputeUf).toHaveBeenCalledTimes(2);
    expect(exigencias.triggerPrecomputeUf).toHaveBeenCalledWith('SC');
    expect(exigencias.triggerPrecomputeUf).toHaveBeenCalledWith('PR');
  });
});
