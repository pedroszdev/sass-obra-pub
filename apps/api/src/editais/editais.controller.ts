import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../assinaturas/subscription.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { THROTTLE } from '../common/throttling/throttle.config';
import { UserThrottlerGuard } from '../common/throttling/user-throttler.guard';
import { AptidaoService } from '../aptidao/aptidao.service';
import { EditalDetail, EditalSearchResult } from './dto/edital-search-response';
import { SearchEditaisDto } from './dto/search-editais.dto';
import { EditaisSearchService } from './editais-search.service';
import { SearchLogService } from './search-log.service';
import {
  DocumentoEdital,
  EditalDocumentosService,
} from './edital-documentos.service';
import {
  ExigenciasResponse,
  toExigenciasResponse,
} from './exigencias/exigencias-response';
import { ExigenciasService } from './exigencias/exigencias.service';
import { ItensExtracaoService } from './itens/itens-extracao.service';
import {
  ItensExtraidosResponse,
  toItensResponse,
} from './itens/itens-response';

// Busca de editais por região (T-20) e detalhe (T-23). Protegida — o produto
// é para o empreiteiro logado.
@UseGuards(JwtAuthGuard, SubscriptionGuard)
@Controller('editais')
export class EditaisController {
  constructor(
    private readonly search: EditaisSearchService,
    private readonly exigencias: ExigenciasService,
    private readonly itens: ItensExtracaoService,
    private readonly documentos: EditalDocumentosService,
    private readonly aptidao: AptidaoService,
    private readonly searchLog: SearchLogService,
  ) {}

  // Lista + decora cada item com o veredito de aptidão do usuário (T-82), quando
  // o edital já tem exigências extraídas. O cálculo é do backend (§3.3/§3.4).
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filtros: SearchEditaisDto,
  ): Promise<EditalSearchResult> {
    const result = await this.search.search(filtros);
    // Log da busca (T-199) — fire-and-forget, nunca bloqueia a resposta. O total
    // é o que importa: uma busca com total=0 é a região que o cliente quer e não
    // temos.
    this.searchLog.registrarEmSegundoPlano({
      userId: user.id,
      termo: filtros.q,
      ufs: filtros.uf,
      municipios: filtros.codigoIbge,
      valorMin: filtros.valorMin,
      valorMax: filtros.valorMax,
      total: result.total,
    });
    const vereditos = await this.aptidao.vereditosPara(
      user.id,
      result.data.map((e) => e.id),
    );
    result.data = result.data.map((e) => ({
      ...e,
      veredito: vereditos.get(e.id) ?? null,
    }));
    return result;
  }

  // Quantos editais de obra estão abertos agora. PÚBLICA: alimenta o contador
  // "ao vivo" da tela de login, que não tem sessão. Declarada ANTES de `:id`
  // (o Nest casa na ordem) e sem nenhum dado de usuário. Cache de 5 min no
  // service; throttle de captação (10/min por IP) como rede de segurança.
  @Public()
  @Throttle(THROTTLE.CAPTACAO)
  @Get('stats')
  async stats(): Promise<{ abertos: number }> {
    return { abertos: await this.search.contarAbertos() };
  }

  // Detalhe completo de um edital. id inválido → 400; inexistente → 404.
  @Get(':id')
  detalhe(@Param('id', ParseUUIDPipe) id: string): Promise<EditalDetail> {
    return this.search.findById(id);
  }

  // Documentos publicados do edital (T-142), o principal primeiro — é o mesmo
  // ranqueamento que a IA usa, então o PDF que o usuário abre é o que gerou o
  // resumo. SEM IA e sem custo de OpenAI: só lista os arquivos da fonte. Lista
  // vazia quando a fonte não publicou arquivo (o front cai na página da compra).
  // Throttle de captação: a 1ª chamada bate na fonte (depois vem do cache).
  @Throttle(THROTTLE.CAPTACAO)
  @Get(':id/documentos')
  documentosDoEdital(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentoEdital[]> {
    return this.documentos.listar(id);
  }

  // Exigências de habilitação extraídas por IA (T-49). Cacheado (§3.4): extrai
  // na 1ª vez e reusa depois. id inválido → 400; edital inexistente → 404.
  // Throttle por usuário (T-104): a 1ª chamada gasta OpenAI — barra um script
  // iterando editalIds diferentes (custo/§3.4).
  @Throttle(THROTTLE.IA)
  @UseGuards(UserThrottlerGuard)
  @Get(':id/exigencias')
  async exigenciasDoEdital(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExigenciasResponse> {
    return toExigenciasResponse(await this.exigencias.getOrExtract(id));
  }

  // Itens da planilha orçamentária extraídos por IA (T-64). Cacheado (§3.4):
  // extrai na 1ª vez e reusa. Vem vazio quando não há planilha extraível
  // (→ import manual, T-65). id inválido → 400; edital inexistente → 404.
  // Throttle por usuário (T-104): a 1ª chamada gasta OpenAI.
  @Throttle(THROTTLE.IA)
  @UseGuards(UserThrottlerGuard)
  @Get(':id/itens-extraidos')
  async itensDoEdital(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ItensExtraidosResponse> {
    return toItensResponse(await this.itens.getOrExtract(id));
  }
}
