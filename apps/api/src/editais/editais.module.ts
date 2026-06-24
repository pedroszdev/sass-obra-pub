import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  EDITAL_SOURCE_CONNECTORS,
  EditalSourceConnector,
} from './connectors/edital-source-connector';
import { PncpConnector } from './connectors/pncp/pncp.connector';
import { EditaisController } from './editais.controller';
import { EditaisSearchService } from './editais-search.service';
import { EditalIngestionService } from './edital-ingestion.service';
import { EditalUpsertService } from './edital-upsert.service';
import { Edital } from './edital.entity';
import { DocumentoTextoService } from './exigencias/documento-texto.service';
import { EditalExigencias } from './exigencias/edital-exigencias.entity';
import { ExigenciasService } from './exigencias/exigencias.service';
import { IaExtracaoService } from './exigencias/ia-extracao.service';
import { SyncModule } from './sync/sync.module';
import { UfCaptureService } from './uf-capture.service';

// Registra a entidade e agrega os conectores de fonte num array sob o token.
// Fonte nova = adicionar o provider do conector e incluí-lo no factory abaixo.
// O job (T-18) injeta EditalSourceConnector[] e itera todos. A busca (T-20)
// é exposta pelo EditaisController via EditaisSearchService.
@Module({
  imports: [TypeOrmModule.forFeature([Edital, EditalExigencias]), SyncModule],
  controllers: [EditaisController],
  providers: [
    PncpConnector,
    {
      provide: EDITAL_SOURCE_CONNECTORS,
      useFactory: (pncp: PncpConnector): EditalSourceConnector[] => [pncp],
      inject: [PncpConnector],
    },
    EditalUpsertService,
    EditalIngestionService,
    EditaisSearchService,
    UfCaptureService,
    // Extração de exigências com IA + cache (T-49).
    DocumentoTextoService,
    IaExtracaoService,
    ExigenciasService,
  ],
  exports: [
    EDITAL_SOURCE_CONNECTORS,
    EditalUpsertService,
    EditalIngestionService,
    UfCaptureService,
    // Exposto para o diagnóstico específico por edital (T-51, company-profile).
    ExigenciasService,
  ],
})
export class EditaisModule {}
