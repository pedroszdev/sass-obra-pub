import { ValueTransformer } from 'typeorm';

// O tipo numeric do Postgres volta como string no TypeORM. Este transformer
// devolve number. numeric(15,2) cabe no inteiro seguro do JS, então parseFloat
// é suficiente para valores de edital.
export const decimalTransformer: ValueTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null =>
    value === null ? null : parseFloat(value),
};
