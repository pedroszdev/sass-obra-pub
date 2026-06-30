import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Edital } from '../editais/edital.entity';
import { ItensStatus } from '../editais/itens/edital-itens-extracao.entity';
import { ItensExtracaoService } from '../editais/itens/itens-extracao.service';
import { CreatePropostaDto } from './dto/create-proposta.dto';
import { CreatePropostaItemDto } from './dto/create-proposta-item.dto';
import {
  ImportarItensResponse,
  PropostaDetailResponse,
  PropostaItemResponse,
  PropostaResponse,
  toPropostaDetailResponse,
  toPropostaItemResponse,
  toPropostaResponse,
} from './dto/proposta-response';
import { UpdatePropostaDto } from './dto/update-proposta.dto';
import { UpdatePropostaItemDto } from './dto/update-proposta-item.dto';
import { Proposta } from './proposta.entity';
import { PropostaItem } from './proposta-item.entity';

// Copia só os campos definidos do DTO para a entidade (merge de PUT parcial):
// campos ausentes no body chegam como undefined e não devem zerar o que existe.
function applyDefined<T>(target: T, patch: Partial<T>): void {
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (patch[key] !== undefined) {
      target[key] = patch[key] as T[keyof T];
    }
  }
}

// CRUD das propostas e seus itens (BACKLOG T-61). Tudo escopado ao usuário do
// JWT — o user_id nunca vem do body. Operações por :id que não forem do dono
// respondem 404 (não vazam existência alheia). Sem cálculo de totais (T-66).
@Injectable()
export class PropostasService {
  constructor(
    @InjectRepository(Proposta)
    private readonly propostas: Repository<Proposta>,
    @InjectRepository(PropostaItem)
    private readonly itens: Repository<PropostaItem>,
    // Para validar o vínculo do edital ao criar (mesmo espírito do FavoritosService).
    @InjectRepository(Edital)
    private readonly editais: Repository<Edital>,
    // Extração da planilha de itens por IA (T-64) para o "importar do edital".
    private readonly itensExtracao: ItensExtracaoService,
  ) {}

  // Cria a proposta. 404 se o edital não existe. valorReferencia: usa o do body
  // ou, na ausência, copia o valor estimado do edital (snapshot do teto).
  async create(
    userId: string,
    dto: CreatePropostaDto,
  ): Promise<PropostaResponse> {
    const edital = await this.editais.findOne({
      where: { id: dto.editalId },
      select: { id: true, valorEstimado: true },
    });
    if (!edital) {
      throw new NotFoundException('Edital não encontrado');
    }
    const proposta = this.propostas.create({
      userId,
      editalId: dto.editalId,
      titulo: dto.titulo,
      bdiPercentual: dto.bdiPercentual ?? null,
      valorReferencia: dto.valorReferencia ?? edital.valorEstimado ?? null,
    });
    return toPropostaResponse(await this.propostas.save(proposta));
  }

  // Lista as propostas do usuário (resumo, sem itens), mais recentes primeiro.
  // Filtro opcional por edital (útil para a integração da T-71).
  async list(userId: string, editalId?: string): Promise<PropostaResponse[]> {
    const rows = await this.propostas.find({
      where: editalId ? { userId, editalId } : { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toPropostaResponse);
  }

  // Detalhe da proposta com os itens ordenados.
  async findOne(userId: string, id: string): Promise<PropostaDetailResponse> {
    const proposta = await this.getOwned(userId, id);
    const itens = await this.itens.find({
      where: { propostaId: id },
      order: { ordem: 'ASC', createdAt: 'ASC' },
    });
    return toPropostaDetailResponse(proposta, itens);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdatePropostaDto,
  ): Promise<PropostaResponse> {
    const proposta = await this.getOwned(userId, id);
    applyDefined(proposta, dto);
    return toPropostaResponse(await this.propostas.save(proposta));
  }

  async remove(userId: string, id: string): Promise<void> {
    const { affected } = await this.propostas.delete({ id, userId });
    if (!affected) {
      throw new NotFoundException('Proposta não encontrada');
    }
  }

  // Adiciona um item ao fim da proposta (ordem = última + 1).
  async addItem(
    userId: string,
    propostaId: string,
    dto: CreatePropostaItemDto,
  ): Promise<PropostaItemResponse> {
    await this.assertPropostaDoUsuario(userId, propostaId);
    const item = this.itens.create({
      propostaId,
      descricao: dto.descricao,
      unidade: dto.unidade ?? null,
      quantidade: dto.quantidade ?? null,
      precoUnitario: dto.precoUnitario ?? null,
      ordem: await this.nextOrdem(propostaId),
    });
    return toPropostaItemResponse(await this.itens.save(item));
  }

  // Importa os itens da planilha do edital (T-64) para dentro da proposta:
  // descrição/unidade/quantidade vêm da extração por IA; o preço fica null para
  // o empreiteiro preencher (T-68). Os itens são adicionados ao fim. Se o edital
  // não tem planilha extraível (status != extraido), não importa nada — o front
  // cai no fallback manual (T-65).
  async importarItensDoEdital(
    userId: string,
    propostaId: string,
  ): Promise<ImportarItensResponse> {
    const proposta = await this.getOwned(userId, propostaId);
    const extracao = await this.itensExtracao.getOrExtract(proposta.editalId);
    const itensExtraidos =
      extracao.status === ItensStatus.EXTRAIDO ? (extracao.itens ?? []) : [];
    if (itensExtraidos.length > 0) {
      let ordem = await this.nextOrdem(propostaId);
      const novos = itensExtraidos.map((it) =>
        this.itens.create({
          propostaId,
          descricao: it.descricao,
          unidade: it.unidade ?? null,
          quantidade: it.quantidade ?? null,
          precoUnitario: null,
          ordem: ordem++,
        }),
      );
      await this.itens.save(novos);
    }
    return {
      status: extracao.status,
      importados: itensExtraidos.length,
      proposta: await this.findOne(userId, propostaId),
    };
  }

  // Adiciona vários itens ao fim da proposta (T-65 — colar de uma planilha).
  async addItensBulk(
    userId: string,
    propostaId: string,
    dtos: CreatePropostaItemDto[],
  ): Promise<PropostaDetailResponse> {
    await this.assertPropostaDoUsuario(userId, propostaId);
    let ordem = await this.nextOrdem(propostaId);
    const novos = dtos.map((dto) =>
      this.itens.create({
        propostaId,
        descricao: dto.descricao,
        unidade: dto.unidade ?? null,
        quantidade: dto.quantidade ?? null,
        precoUnitario: dto.precoUnitario ?? null,
        ordem: ordem++,
      }),
    );
    await this.itens.save(novos);
    return this.findOne(userId, propostaId);
  }

  async updateItem(
    userId: string,
    propostaId: string,
    itemId: string,
    dto: UpdatePropostaItemDto,
  ): Promise<PropostaItemResponse> {
    await this.assertPropostaDoUsuario(userId, propostaId);
    const item = await this.itens.findOne({
      where: { id: itemId, propostaId },
    });
    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }
    applyDefined(item, dto);
    return toPropostaItemResponse(await this.itens.save(item));
  }

  async removeItem(
    userId: string,
    propostaId: string,
    itemId: string,
  ): Promise<void> {
    await this.assertPropostaDoUsuario(userId, propostaId);
    const { affected } = await this.itens.delete({ id: itemId, propostaId });
    if (!affected) {
      throw new NotFoundException('Item não encontrado');
    }
  }

  // Reordena os itens da proposta. A lista precisa conter exatamente os ids dos
  // itens (sem faltar, sobrar ou repetir); grava ordem = índice.
  async reordenarItens(
    userId: string,
    propostaId: string,
    ordem: string[],
  ): Promise<void> {
    await this.assertPropostaDoUsuario(userId, propostaId);
    const itens = await this.itens.find({
      where: { propostaId },
      select: { id: true },
    });
    const existentes = new Set(itens.map((i) => i.id));
    const semDuplicatas = new Set(ordem).size === ordem.length;
    const conjuntoBate =
      ordem.length === existentes.size &&
      ordem.every((id) => existentes.has(id));
    if (!semDuplicatas || !conjuntoBate) {
      throw new BadRequestException(
        'A lista de ordem deve conter exatamente os itens da proposta',
      );
    }
    await Promise.all(
      ordem.map((id, idx) =>
        this.itens.update({ id, propostaId }, { ordem: idx }),
      ),
    );
  }

  // Carrega a proposta garantindo que é do usuário (senão 404).
  private async getOwned(userId: string, id: string): Promise<Proposta> {
    const proposta = await this.propostas.findOne({ where: { id, userId } });
    if (!proposta) {
      throw new NotFoundException('Proposta não encontrada');
    }
    return proposta;
  }

  private async assertPropostaDoUsuario(
    userId: string,
    propostaId: string,
  ): Promise<void> {
    const count = await this.propostas.count({
      where: { id: propostaId, userId },
    });
    if (count === 0) {
      throw new NotFoundException('Proposta não encontrada');
    }
  }

  // Próxima posição livre na proposta (append). 0 quando não há itens.
  private async nextOrdem(propostaId: string): Promise<number> {
    const ultimo = await this.itens.findOne({
      where: { propostaId },
      order: { ordem: 'DESC' },
    });
    return ultimo ? ultimo.ordem + 1 : 0;
  }
}
