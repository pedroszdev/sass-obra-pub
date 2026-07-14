import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AptidaoModule } from '../aptidao/aptidao.module';
import {
  EDITAL_SOURCE_CONNECTORS,
  EditalSourceConnector,
} from './connectors/edital-source-connector';
import { PncpConnector } from './connectors/pncp/pncp.connector';
import { EditaisController } from './editais.controller';
import { EditaisSearchService } from './editais-search.service';
import { EditalDocumentosService } from './edital-documentos.service';
import { EditalIngestionService } from './edital-ingestion.service';
import { EditalUpsertService } from './edital-upsert.service';
import { Edital } from './edital.entity';
import { DocumentoTextoService } from './exigencias/documento-texto.service';
import { EditalExigencias } from './exigencias/edital-exigencias.entity';
import { ExigenciasService } from './exigencias/exigencias.service';
import { IaCustoService } from './ia-custo.service';
import { IaExtracaoService } from './exigencias/ia-extracao.service';
import { EditalItensExtracao } from './itens/edital-itens-extracao.entity';
import { ItensExtracaoService } from './itens/itens-extracao.service';
import { PlanilhaTextoService } from './itens/planilha-texto.service';
import { SyncModule } from './sync/sync.module';
import { UfCaptureService } from './uf-capture.service';

// Registra a entidade e agrega os conectores de fonte num array sob o token.
// Fonte nova = adicionar o provider do conector e incluí-lo no factory abaixo.
// O job (T-18) injeta EditalSourceConnector[] e itera todos. A busca (T-20)
// é exposta pelo EditaisController via EditaisSearchService.
@Module({
  imports: [
    TypeOrmModule.forFeature([Edital, EditalExigencias, EditalItensExtracao]),
    SyncModule,
    AptidaoModule,
  ],
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
    EditalDocumentosService,
    UfCaptureService,
    // Custo de IA: agregação + teto/circuit-breaker (T-133).
    IaCustoService,
    // Extração de exigências com IA + cache (T-49).
    DocumentoTextoService,
    IaExtracaoService,
    ExigenciasService,
    // Extração da planilha de itens com IA + cache (T-64).
    PlanilhaTextoService,
    ItensExtracaoService,
  ],
  exports: [
    EDITAL_SOURCE_CONNECTORS,
    EditalUpsertService,
    EditalIngestionService,
    UfCaptureService,
    // Expostos para o diagnóstico específico (T-51) e o filtro de aptidão (T-53),
    // ambos no company-profile.
    ExigenciasService,
    EditaisSearchService,
    // Exposto para a importação de itens na proposta (T-64 → propostas).
    ItensExtracaoService,
    // Exposto para a leitura de custo de IA no CaptacaoController (T-133).
    IaCustoService,
  ],
})
export class EditaisModule {}
