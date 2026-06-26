import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Edital } from '../editais/edital.entity';
import { Proposta } from './proposta.entity';
import { PropostaItem } from './proposta-item.entity';
import { PropostasController } from './propostas.controller';
import { PropostasService } from './propostas.service';

// Orçamento integrado ao edital (BACKLOG Épico 6). T-60 modelou as entidades;
// T-61 expõe o CRUD (proposta + itens). O repositório de Edital entra para
// validar o vínculo ao criar a proposta. O motor de cálculo (T-66) virá depois.
@Module({
  imports: [TypeOrmModule.forFeature([Proposta, PropostaItem, Edital])],
  controllers: [PropostasController],
  providers: [PropostasService],
})
export class PropostasModule {}
