import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { THROTTLE } from '../common/throttling/throttle.config';
import { UserThrottlerGuard } from '../common/throttling/user-throttler.guard';
import { CreatePropostaDto } from './dto/create-proposta.dto';
import { CreatePropostaItemDto } from './dto/create-proposta-item.dto';
import { CreatePropostaItensBulkDto } from './dto/create-proposta-itens-bulk.dto';
import {
  ImportarItensResponse,
  PropostaDetailResponse,
  PropostaItemResponse,
  PropostaListItemResponse,
  PropostaResponse,
} from './dto/proposta-response';
import { ReordenarItensDto } from './dto/reordenar-itens.dto';
import { UpdatePropostaDto } from './dto/update-proposta.dto';
import { UpdatePropostaItemDto } from './dto/update-proposta-item.dto';
import { PropostasService } from './propostas.service';

// CRUD das propostas de preço do empreiteiro logado (BACKLOG T-61). Tudo
// escopado ao usuário do JWT; operações por :id de outro dono respondem 404.
@UseGuards(JwtAuthGuard)
@Controller('propostas')
export class PropostasController {
  constructor(private readonly propostas: PropostasService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePropostaDto,
  ): Promise<PropostaResponse> {
    return this.propostas.create(user.id, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('editalId', new ParseUUIDPipe({ optional: true }))
    editalId?: string,
  ): Promise<PropostaListItemResponse[]> {
    return this.propostas.list(user.id, editalId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PropostaDetailResponse> {
    return this.propostas.findOne(user.id, id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePropostaDto,
  ): Promise<PropostaResponse> {
    return this.propostas.update(user.id, id, dto);
  }

  // Exporta a proposta como CSV (T-70) — abre/edita no Excel. BOM (U+FEFF) para
  // o Excel reconhecer UTF-8 (acentos). O front escolhe o nome do arquivo.
  @Get(':id/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="proposta.csv"')
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<string> {
    const { csv } = await this.propostas.exportarCsv(user.id, id);
    return String.fromCharCode(0xfeff) + csv;
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.propostas.remove(user.id, id);
  }

  @Post(':id/itens')
  addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePropostaItemDto,
  ): Promise<PropostaItemResponse> {
    return this.propostas.addItem(user.id, id, dto);
  }

  // Importa os itens da planilha do edital por IA (T-64). Pode demorar na 1ª vez
  // (extração); cacheado depois. Vem importados=0 quando não há planilha → T-65.
  // Throttle por usuário (T-104): a 1ª chamada gasta OpenAI (custo §3.4).
  @Throttle(THROTTLE.IA)
  @UseGuards(UserThrottlerGuard)
  @Post(':id/itens/importar')
  importarItens(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ImportarItensResponse> {
    return this.propostas.importarItensDoEdital(user.id, id);
  }

  // Inclusão em lote — colar de uma planilha (T-65, fallback manual).
  @Post(':id/itens/bulk')
  addItensBulk(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePropostaItensBulkDto,
  ): Promise<PropostaDetailResponse> {
    return this.propostas.addItensBulk(user.id, id, dto.itens);
  }

  // Reordenação em lote — rota sem :itemId (distinta de PUT :id/itens/:itemId).
  @HttpCode(HttpStatus.NO_CONTENT)
  @Put(':id/itens')
  reordenarItens(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReordenarItensDto,
  ): Promise<void> {
    return this.propostas.reordenarItens(user.id, id, dto.ordem);
  }

  @Put(':id/itens/:itemId')
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdatePropostaItemDto,
  ): Promise<PropostaItemResponse> {
    return this.propostas.updateItem(user.id, id, itemId, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/itens/:itemId')
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    return this.propostas.removeItem(user.id, id, itemId);
  }
}
