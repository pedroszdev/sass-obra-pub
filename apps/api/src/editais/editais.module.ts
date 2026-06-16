import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  EDITAL_SOURCE_CONNECTORS,
  EditalSourceConnector,
} from './connectors/edital-source-connector';
import { PncpConnector } from './connectors/pncp/pncp.connector';
import { EditalUpsertService } from './edital-upsert.service';
import { Edital } from './edital.entity';

// Registra a entidade e agrega os conectores de fonte num array sob o token.
// Fonte nova = adicionar o provider do conector e incluí-lo no factory abaixo.
// O job (T-18) injeta EditalSourceConnector[] e itera todos. Endpoints de
// busca vêm na T-20.
@Module({
  imports: [TypeOrmModule.forFeature([Edital])],
  providers: [
    PncpConnector,
    {
      provide: EDITAL_SOURCE_CONNECTORS,
      useFactory: (pncp: PncpConnector): EditalSourceConnector[] => [pncp],
      inject: [PncpConnector],
    },
    EditalUpsertService,
  ],
  exports: [EDITAL_SOURCE_CONNECTORS, EditalUpsertService],
})
export class EditaisModule {}
