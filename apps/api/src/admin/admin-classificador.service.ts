import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Edital } from '../editais/edital.entity';
import { razaoObra } from '../editais/obra/obra-classifier';
import { ClassifierReview } from './classifier-review.entity';

// Amostra recente (não histórico) — a fila cobre o ruído que entra agora.
const LIMITE = 300;
const PAGE_SIZE = 20;

export interface FilaItem {
  editalId: string;
  objeto: string;
  municipio: string;
  uf: string;
  modalidadeId: number;
  razao: string;
  createdAt: Date;
}

export interface FilaPagina {
  data: FilaItem[];
  total: number;
  page: number;
  pageSize: number;
}

// Fila de revisão do classificador (T-191). Lista as classificações de BAIXA
// CONFIANÇA (obra só pela modalidade, favor-recall §3.3) para correção manual, e
// guarda o veredito como dataset (T-140). A razão é recalculada on-the-fly
// (função pura sobre campos já no edital) — sem coluna nova.
@Injectable()
export class AdminClassificadorService {
  constructor(
    @InjectRepository(Edital) private readonly editais: Repository<Edital>,
    @InjectRepository(ClassifierReview)
    private readonly reviews: Repository<ClassifierReview>,
  ) {}

  async fila(page: number): Promise<FilaPagina> {
    // Amostra recente de OBRAS; recalcula a razão e fica só com 'modalidade'.
    const candidatos = await this.editais.find({
      where: { isObra: true },
      order: { createdAt: 'DESC' },
      take: LIMITE,
      select: {
        id: true,
        objeto: true,
        municipioNome: true,
        uf: true,
        modalidadeId: true,
        fonte: true,
        createdAt: true,
      },
    });

    const baixaConfianca = candidatos.filter(
      (e) =>
        razaoObra({
          fonte: e.fonte,
          modalidadeId: e.modalidadeId,
          objeto: e.objeto,
        }) === 'modalidade',
    );

    // Exclui os já revisados.
    const revisados = await this.revisadosEntre(
      baixaConfianca.map((e) => e.id),
    );
    const pendentes = baixaConfianca.filter((e) => !revisados.has(e.id));

    const total = pendentes.length;
    const pagina = pendentes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    return {
      data: pagina.map((e) => ({
        editalId: e.id,
        objeto: e.objeto,
        municipio: e.municipioNome,
        uf: e.uf,
        modalidadeId: e.modalidadeId,
        razao: 'modalidade',
        createdAt: e.createdAt,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  // Registra o veredito humano (dataset) e ajusta o isObra do edital (integra com
  // a busca: "não é obra" tira da busca).
  async revisar(editalId: string, obra: boolean): Promise<void> {
    const edital = await this.editais.findOne({
      where: { id: editalId },
      select: { id: true, objeto: true, modalidadeId: true, fonte: true },
    });
    if (!edital) throw new NotFoundException('Edital não encontrado.');

    const razaoOriginal = razaoObra({
      fonte: edital.fonte,
      modalidadeId: edital.modalidadeId,
      objeto: edital.objeto,
    });

    await this.reviews.upsert(
      {
        editalId,
        veredito: obra ? 'obra' : 'nao_obra',
        razaoOriginal,
      },
      ['editalId'],
    );
    await this.editais.update(editalId, { isObra: obra });
  }

  private async revisadosEntre(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.reviews.find({
      where: { editalId: In(ids) },
      select: { editalId: true },
    });
    return new Set(rows.map((r) => r.editalId));
  }
}
