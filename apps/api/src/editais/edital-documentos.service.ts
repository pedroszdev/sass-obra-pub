import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { sanitizeUrlExterna } from '../common/url-documento';
import {
  EDITAL_SOURCE_CONNECTORS,
  EditalSourceConnector,
} from './connectors/edital-source-connector';
import { Edital } from './edital.entity';

// Documentos de um edital, para o usuário ABRIR (T-142). Reusa o
// `fetchEditalDocuments` do conector — o mesmo que alimenta a IA (§3.1), já
// ranqueado com o edital principal na frente. Logo o PDF que o empreiteiro abre
// é o MESMO que gerou o resumo; se divergissem, o resumo falaria de outro papel.
//
// Sem IA e sem custo de OpenAI: é só a listagem de arquivos da fonte.

export interface DocumentoEdital {
  nome: string;
  url: string;
}

// A listagem é uma chamada de rede à fonte por edital. Um cache curto evita que
// cada abertura da tela (e cada F5) vire um GET no PNCP — o conjunto de arquivos
// de um edital publicado praticamente não muda.
const CACHE_TTL_MS = 10 * 60_000;

@Injectable()
export class EditalDocumentosService {
  private readonly logger = new Logger(EditalDocumentosService.name);
  private readonly cache = new Map<
    string,
    { docs: DocumentoEdital[]; expiraEm: number }
  >();

  constructor(
    @InjectRepository(Edital)
    private readonly editais: Repository<Edital>,
    @Inject(EDITAL_SOURCE_CONNECTORS)
    private readonly connectors: EditalSourceConnector[],
  ) {}

  // Documentos do edital, o principal primeiro. Lista VAZIA quando a fonte não
  // publicou arquivo — não é erro (o front cai no link da página da compra).
  async listar(
    editalId: string,
    now: number = Date.now(),
  ): Promise<DocumentoEdital[]> {
    const cache = this.cache.get(editalId);
    if (cache && cache.expiraEm > now) {
      return cache.docs;
    }

    const edital = await this.editais.findOne({
      where: { id: editalId },
      select: { id: true, fonte: true, idExterno: true },
    });
    if (!edital) {
      throw new NotFoundException('Edital não encontrado');
    }

    const connector = this.connectors.find((c) => c.fonte === edital.fonte);
    if (!connector) {
      this.logger.warn(`Sem conector para a fonte ${edital.fonte}`);
      return [];
    }

    let docs: DocumentoEdital[];
    try {
      docs = this.apenasLinkaveis(
        await connector.fetchEditalDocuments(edital.idExterno),
      );
    } catch (error) {
      // Fonte fora do ar não pode derrubar a tela do edital: devolve vazio e o
      // front oferece a página da compra, que é sempre derivável.
      this.logger.warn(
        `Falha ao listar documentos do edital ${editalId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }

    this.cache.set(editalId, { docs, expiraEm: now + CACHE_TTL_MS });
    return docs;
  }

  // Estes documentos viram `href` na tela do edital (T-142), e a URL vem VERBATIM
  // do feed da fonte — o conector só a repassa. Um scheme perigoso (`javascript:`,
  // `data:`) num href executa script na origem quando o usuário clica.
  //
  // É a mesma regra da T-119d que já protege o `linkOrigem` (sanitizeUrl no
  // pncp.mapper + httpHref no front): a URL do documento vem do MESMO feed, de
  // milhares de sistemas municipais heterogêneos, e não é mais confiável que a
  // irmã. A T-142 criou este caminho e ficou de fora das duas guardas.
  //
  // A guarda mora AQUI, e não no conector, porque este é o ponto por onde todo
  // conector (inclusive a Camada 2 do §9, que ainda nem existe) serve a tela —
  // no conector ela valeria só para o PNCP. O `fetch` do servidor tem a política
  // própria dele, mais estrita (`assertUrlDocumento`: só https, contra SSRF).
  private apenasLinkaveis(docs: DocumentoEdital[]): DocumentoEdital[] {
    const seguros: DocumentoEdital[] = [];
    for (const doc of docs) {
      const url = sanitizeUrlExterna(doc.url);
      if (!url) {
        this.logger.warn(
          `Documento descartado (scheme não-http): ${doc.url.slice(0, 60)}`,
        );
        continue;
      }
      seguros.push({ ...doc, url });
    }
    return seguros;
  }
}
