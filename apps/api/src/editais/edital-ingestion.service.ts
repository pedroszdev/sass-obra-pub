import { Injectable } from '@nestjs/common';
import { EditalSourceRecord } from './connectors/edital-source-record';
import { EditalUpsertService, UpsertOutcome } from './edital-upsert.service';
import { isEditalObra } from './obra/obra-classifier';

export interface IngestionResult {
  outcome: UpsertOutcome;
  isObra: boolean;
}

// Cola da ingestão: classifica (obra?) com o catálogo (T-09) e persiste (T-14).
// Guardamos TODOS os editais (obra e não-obra), marcados via `isObra` — assim
// ajustar o catálogo depois não exige reprocessar a fonte (CLAUDE.md §3.3).
@Injectable()
export class EditalIngestionService {
  constructor(private readonly upsertService: EditalUpsertService) {}

  async ingest(record: EditalSourceRecord): Promise<IngestionResult> {
    const isObra = isEditalObra({
      fonte: record.fonte,
      modalidadeId: record.modalidadeId,
      objeto: record.objeto,
    });
    const outcome = await this.upsertService.upsert(record, isObra);
    return { outcome, isObra };
  }
}
