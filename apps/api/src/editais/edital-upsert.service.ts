import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { EditalSourceRecord } from './connectors/edital-source-record';
import { Edital } from './edital.entity';

export type UpsertOutcome = 'created' | 'updated' | 'unchanged';

// Persiste editais deduplicando por (fonte, idExterno) — CLAUDE.md §3.2.
// `isObra` vem de fora (classificador da T-09, aplicado pela T-15); aqui só persiste.
@Injectable()
export class EditalUpsertService {
  constructor(
    @InjectRepository(Edital)
    private readonly repo: Repository<Edital>,
  ) {}

  async upsert(
    record: EditalSourceRecord,
    isObra: boolean,
  ): Promise<UpsertOutcome> {
    const existing = await this.repo.findOne({
      where: { fonte: record.fonte, idExterno: record.idExterno },
    });

    if (!existing) {
      await this.repo.save(this.toEntity(record, isObra));
      return 'created';
    }
    if (!this.hasChanged(existing, record, isObra)) {
      return 'unchanged';
    }
    await this.repo.save({ ...this.toEntity(record, isObra), id: existing.id });
    return 'updated';
  }

  private toEntity(
    record: EditalSourceRecord,
    isObra: boolean,
  ): DeepPartial<Edital> {
    return {
      fonte: record.fonte,
      idExterno: record.idExterno,
      orgaoNome: record.orgaoNome,
      orgaoCnpj: record.orgaoCnpj,
      uf: record.uf,
      municipioNome: record.municipioNome,
      codigoIbge: record.codigoIbge,
      objeto: record.objeto,
      modalidadeId: record.modalidadeId,
      modalidadeNome: record.modalidadeNome,
      valorEstimado: record.valorEstimado,
      dataPublicacao: record.dataPublicacao,
      prazoProposta: record.prazoProposta,
      linkOrigem: record.linkOrigem,
      situacao: record.situacao,
      isObra,
      rawPayload: record.rawPayload,
    };
  }

  // Compara os campos que mudam de fato. Se algum diferiu, é atualização.
  private hasChanged(
    existing: Edital,
    record: EditalSourceRecord,
    isObra: boolean,
  ): boolean {
    return (
      existing.objeto !== record.objeto ||
      existing.modalidadeId !== record.modalidadeId ||
      existing.modalidadeNome !== record.modalidadeNome ||
      !this.sameMoney(existing.valorEstimado, record.valorEstimado) ||
      !this.sameInstant(existing.dataPublicacao, record.dataPublicacao) ||
      !this.sameInstant(existing.prazoProposta, record.prazoProposta) ||
      existing.linkOrigem !== record.linkOrigem ||
      existing.situacao !== record.situacao ||
      existing.orgaoNome !== record.orgaoNome ||
      existing.orgaoCnpj !== record.orgaoCnpj ||
      existing.municipioNome !== record.municipioNome ||
      existing.codigoIbge !== record.codigoIbge ||
      existing.isObra !== isObra
    );
  }

  private sameInstant(a: Date | null, b: Date | null): boolean {
    if (a === null || b === null) {
      return a === b;
    }
    return a.getTime() === b.getTime();
  }

  // Compara dinheiro em centavos — evita falso "mudou" por precisão de float
  // (a coluna é numeric(15,2)).
  private sameMoney(a: number | null, b: number | null): boolean {
    if (a === null || b === null) {
      return a === b;
    }
    return Math.round(a * 100) === Math.round(b * 100);
  }
}
