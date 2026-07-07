import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Municipio } from '../geo/municipio.entity';
import { User } from './user.entity';

// Município de atuação preferido do usuário (BACKLOG T-94). N:N entre users e
// municipios — COMPLEMENTA a `uf` de cadastro (não substitui). Sem preferência,
// tudo cai no comportamento por UF inteira. PK composta (user_id, codigo_ibge):
// a própria combinação é única, não precisa de id sintético.
@Entity('user_municipios')
export class UserMunicipio {
  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @PrimaryColumn({ type: 'char', length: 7, name: 'codigo_ibge' })
  codigoIbge!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Municipio, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'codigo_ibge' })
  municipio!: Municipio;
}
