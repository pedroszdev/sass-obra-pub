import 'reflect-metadata';
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import dataSource from '../database/data-source';
import { normalizeText } from '../common/text';
import { Uf } from '../common/uf';
import { Municipio } from './municipio.entity';

interface RawMunicipio {
  c: string; // código IBGE
  n: string; // nome
  uf: string; // sigla da UF
}

// Popula a tabela `municipios` a partir do JSON do IBGE (commitado). Idempotente:
// faz upsert por codigoIbge e pula se a tabela já está completa. Roda em dev via
// `pnpm --filter api seed:municipios` e em produção pelo docker-entrypoint.
async function seed(): Promise<void> {
  const raw = readFileSync(join(__dirname, 'data', 'municipios.json'), 'utf-8');
  const data = JSON.parse(raw) as RawMunicipio[];

  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(Municipio);
    const existentes = await repo.count();
    if (existentes >= data.length) {
      console.log(`Municípios já populados (${existentes}). Nada a fazer.`);
      return;
    }

    const rows = data.map((m) => ({
      codigoIbge: m.c,
      nome: m.n,
      nomeNormalizado: normalizeText(m.n),
      uf: m.uf as Uf,
    }));

    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      await repo.upsert(rows.slice(i, i + BATCH), ['codigoIbge']);
    }
    console.log(`Seed de municípios concluído: ${rows.length} registros.`);
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((err: unknown) => {
  console.error('Falha no seed de municípios:', err);
  process.exit(1);
});
