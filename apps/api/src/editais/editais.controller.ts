import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EditalDetail, EditalSearchResult } from './dto/edital-search-response';
import { SearchEditaisDto } from './dto/search-editais.dto';
import { EditaisSearchService } from './editais-search.service';
import {
  ExigenciasResponse,
  toExigenciasResponse,
} from './exigencias/exigencias-response';
import { ExigenciasService } from './exigencias/exigencias.service';

// Busca de editais por região (T-20) e detalhe (T-23). Protegida — o produto
// é para o empreiteiro logado.
@UseGuards(JwtAuthGuard)
@Controller('editais')
export class EditaisController {
  constructor(
    private readonly search: EditaisSearchService,
    private readonly exigencias: ExigenciasService,
  ) {}

  @Get()
  list(@Query() filtros: SearchEditaisDto): Promise<EditalSearchResult> {
    return this.search.search(filtros);
  }

  // Detalhe completo de um edital. id inválido → 400; inexistente → 404.
  @Get(':id')
  detalhe(@Param('id', ParseUUIDPipe) id: string): Promise<EditalDetail> {
    return this.search.findById(id);
  }

  // Exigências de habilitação extraídas por IA (T-49). Cacheado (§3.4): extrai
  // na 1ª vez e reusa depois. id inválido → 400; edital inexistente → 404.
  @Get(':id/exigencias')
  async exigenciasDoEdital(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExigenciasResponse> {
    return toExigenciasResponse(await this.exigencias.getOrExtract(id));
  }
}
