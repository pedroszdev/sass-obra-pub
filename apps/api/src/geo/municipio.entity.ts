import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { Uf } from '../common/uf';

// Base de municípios do IBGE — padroniza o filtro regional e habilita busca
// por cidade. Cada edital se associa a um município pelo `codigoIbge`.
@Entity('municipios')
export class Municipio {
  @PrimaryColumn({ type: 'char', length: 7, name: 'codigo_ibge' })
  codigoIbge!: string;

  @Column({ type: 'varchar', length: 150 })
  nome!: string;

  // Nome sem acento/caixa — para busca rápida e tolerante a acento.
  @Index('IDX_municipios_nome_normalizado')
  @Column({ type: 'varchar', length: 150, name: 'nome_normalizado' })
  nomeNormalizado!: string;

  @Index('IDX_municipios_uf')
  @Column({ type: 'varchar', length: 2 })
  uf!: Uf;
}
