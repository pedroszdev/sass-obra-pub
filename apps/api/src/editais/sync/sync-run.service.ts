import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Uf } from '../../common/uf';
import { EditalFonte } from '../edital-fonte.enum';
import { SyncRun } from './sync-run.entity';

export interface SyncRunInput {
  fonte: EditalFonte;
  uf: Uf;
  mode: string;
  status: 'success' | 'error';
  processed: number;
  created: number;
  updated: number;
  obras: number;
  error: string | null;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
}

// Histórico de execuções do job (T-19).
@Injectable()
export class SyncRunService {
  constructor(
    @InjectRepository(SyncRun)
    private readonly repo: Repository<SyncRun>,
  ) {}

  record(input: SyncRunInput): Promise<SyncRun> {
    return this.repo.save(this.repo.create(input));
  }

  // Execuções mais recentes (para inspeção/monitoramento).
  recent(limit = 50): Promise<SyncRun[]> {
    return this.repo.find({ order: { startedAt: 'DESC' }, take: limit });
  }
}
