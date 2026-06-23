import { CaptacaoJobService } from '../src/captacao/captacao-job.service';
import { UfCaptureService } from '../src/editais/uf-capture.service';
import { UsersService } from '../src/users/users.service';

// O job virou um maestro fino (T-34): lê as UFs ativas e delega a captura de
// cada uma ao UfCaptureService. A lógica de backfill/incremental é testada em
// uf-capture.service.spec.ts.
function makeService(ufs: string[]) {
  const capture = { captureUf: jest.fn().mockResolvedValue(undefined) };
  const users = { findDistinctUfs: jest.fn().mockResolvedValue(ufs) };
  const service = new CaptacaoJobService(
    capture as unknown as UfCaptureService,
    users as unknown as UsersService,
  );
  return { service, capture, users };
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
});
