import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { capturarErro } from '../common/observabilidade';
import { Edital } from '../editais/edital.entity';
import {
  EditalExigencias,
  ExigenciasStatus,
} from '../editais/exigencias/edital-exigencias.entity';
import { ExigenciasService } from '../editais/exigencias/exigencias.service';

export interface EditalCuradoria {
  id: string;
  objeto: string;
  municipio: string;
  uf: string;
  situacao: string | null;
  isObra: boolean;
  oculto: boolean;
  ia: {
    status: string | null;
    temResumo: boolean;
    temExigencias: boolean;
    modelo: string | null;
    atualizadoEm: Date | null;
  };
}

// Curadoria de edital (T-197): conserta o caso individual que o cliente reportou.
// O painel (T-188) OBSERVA o pipeline; isto CONSERTA o dado. Toda ação é auditada.
@Injectable()
export class AdminCuradoriaService {
  private readonly logger = new Logger(AdminCuradoriaService.name);

  constructor(
    @InjectRepository(Edital)
    private readonly editais: Repository<Edital>,
    @InjectRepository(EditalExigencias)
    private readonly exigenciasRepo: Repository<EditalExigencias>,
    private readonly exigencias: ExigenciasService,
  ) {}

  async detalhe(id: string): Promise<EditalCuradoria> {
    const edital = await this.editais.findOne({ where: { id } });
    if (!edital) throw new NotFoundException('Edital não encontrado.');
    const ia = await this.exigenciasRepo.findOne({ where: { editalId: id } });
    return {
      id: edital.id,
      objeto: edital.objeto,
      municipio: edital.municipioNome,
      uf: edital.uf,
      situacao: edital.situacao,
      isObra: edital.isObra,
      oculto: edital.oculto,
      ia: {
        status: ia?.status ?? null,
        temResumo: !!ia?.resumo,
        temExigencias: !!ia?.exigencias,
        modelo: ia?.modelo ?? null,
        atualizadoEm: ia?.updatedAt ?? null,
      },
    };
  }

  async corrigirClassificacao(id: string, isObra: boolean): Promise<void> {
    await this.garantirExiste(id);
    await this.editais.update(id, { isObra });
  }

  async alternarVisibilidade(id: string, oculto: boolean): Promise<void> {
    await this.garantirExiste(id);
    await this.editais.update(id, { oculto });
  }

  // Regenera o resumo/exigências: invalida o cache (status ERRO) e re-dispara a
  // extração. ⚠️ REPROCESSAMENTO DELIBERADO de IA — exceção consciente ao §3.4
  // (pedida pela T-197), respeitando o teto de custo (T-133) dentro da extração.
  // Assíncrono: a extração pode levar segundos; o endpoint responde 202.
  async regenerarResumo(id: string): Promise<void> {
    await this.garantirExiste(id);
    // Invalida: só "erro" faz o getOrExtract reprocessar (§3.4). Se não há linha,
    // o getOrExtract já extrai do zero.
    await this.exigenciasRepo.update(
      { editalId: id },
      { status: ExigenciasStatus.ERRO },
    );
    void this.exigencias.getOrExtract(id).catch((e: unknown) => {
      capturarErro(e, 'admin-curadoria.regenerar', { editalId: id });
      this.logger.error(
        `Regeneração do edital ${id} falhou: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  }

  private async garantirExiste(id: string): Promise<void> {
    const existe = await this.editais.exists({ where: { id } });
    if (!existe) throw new NotFoundException('Edital não encontrado.');
  }
}
