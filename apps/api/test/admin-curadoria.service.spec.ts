import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AdminCuradoriaService } from '../src/admin/admin-curadoria.service';
import { Edital } from '../src/editais/edital.entity';
import {
  EditalExigencias,
  ExigenciasStatus,
} from '../src/editais/exigencias/edital-exigencias.entity';
import { ExigenciasService } from '../src/editais/exigencias/exigencias.service';

// Curadoria de edital (T-197). Trava: as ações escrevem o campo certo, regenerar
// invalida o cache (status ERRO) e re-dispara, e edital inexistente dá 404.

function build(opts: { existe?: boolean; edital?: Partial<Edital> } = {}) {
  const editais = {
    findOne: jest.fn().mockResolvedValue(opts.edital ?? null),
    exists: jest.fn().mockResolvedValue(opts.existe ?? true),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  } as unknown as Repository<Edital>;
  const exigenciasRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  } as unknown as Repository<EditalExigencias>;
  const exigencias = {
    getOrExtract: jest.fn().mockResolvedValue(undefined),
  } as unknown as ExigenciasService;
  return {
    service: new AdminCuradoriaService(editais, exigenciasRepo, exigencias),
    editais,
    exigenciasRepo,
    exigencias,
  };
}

describe('AdminCuradoriaService (T-197)', () => {
  it('corrige a classificação (is_obra)', async () => {
    const { service, editais } = build();
    await service.corrigirClassificacao('e1', false);
    expect(editais.update).toHaveBeenCalledWith('e1', { isObra: false });
  });

  it('alterna a visibilidade (oculto)', async () => {
    const { service, editais } = build();
    await service.alternarVisibilidade('e1', true);
    expect(editais.update).toHaveBeenCalledWith('e1', { oculto: true });
  });

  it('regenerar invalida o cache (status ERRO) e re-dispara a extração', async () => {
    const { service, exigenciasRepo, exigencias } = build();
    await service.regenerarResumo('e1');
    expect(exigenciasRepo.update).toHaveBeenCalledWith(
      { editalId: 'e1' },
      { status: ExigenciasStatus.ERRO },
    );
    expect(exigencias.getOrExtract).toHaveBeenCalledWith('e1');
  });

  it('404 quando o edital não existe', async () => {
    const { service } = build({ existe: false });
    await expect(
      service.alternarVisibilidade('zzz', true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('detalhe agrega o estado de IA do edital', async () => {
    const { service, exigenciasRepo } = build({
      edital: {
        id: 'e1',
        objeto: 'Ponte',
        municipioNome: 'Cidade',
        uf: 'SC',
        situacao: null,
        isObra: true,
        oculto: false,
      },
    });
    (exigenciasRepo.findOne as jest.Mock).mockResolvedValue({
      status: 'extraido',
      resumo: { texto: 'x' },
      exigencias: null,
      modelo: 'gpt-5.4-mini',
      updatedAt: new Date('2026-07-14T10:00:00Z'),
    });
    const d = await service.detalhe('e1');
    expect(d.isObra).toBe(true);
    expect(d.ia.temResumo).toBe(true);
    expect(d.ia.temExigencias).toBe(false);
    expect(d.ia.modelo).toBe('gpt-5.4-mini');
  });
});
