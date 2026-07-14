import { Module } from '@nestjs/common';
import { AssinaturasModule } from '../assinaturas/assinaturas.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EditaisModule } from '../editais/editais.module';
import { Edital } from '../editais/edital.entity';
import { Proposta } from './proposta.entity';
import { PropostaItem } from './proposta-item.entity';
import { PropostasController } from './propostas.controller';
import { PropostasService } from './propostas.service';

// Orçamento integrado ao edital (BACKLOG Épico 6). T-60/61 = entidades + CRUD;
// T-66 = motor de cálculo. EditaisModule entra pelo ItensExtracaoService (T-64),
// usado no "importar itens do edital". O repo de Edital valida o vínculo no create.
@Module({
  imports: [
    AssinaturasModule,
    TypeOrmModule.forFeature([Proposta, PropostaItem, Edital]),
    EditaisModule,
  ],
  controllers: [PropostasController],
  providers: [PropostasService],
})
export class PropostasModule {}
