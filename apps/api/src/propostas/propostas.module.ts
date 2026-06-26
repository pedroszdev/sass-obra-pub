import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Proposta } from './proposta.entity';
import { PropostaItem } from './proposta-item.entity';

// Orçamento integrado ao edital (BACKLOG Épico 6). T-60 registra apenas as
// entidades (Proposta + ItemProposta); o CRUD (T-61) e o motor de cálculo
// (T-66) entram nas próximas tasks.
@Module({
  imports: [TypeOrmModule.forFeature([Proposta, PropostaItem])],
})
export class PropostasModule {}
