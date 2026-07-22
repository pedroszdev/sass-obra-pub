import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AdminCuradoriaService,
  EditalCuradoria,
} from './admin-curadoria.service';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminGuard } from './admin.guard';
import { Audit } from './audit.decorator';
import { ClassificacaoDto, VisibilidadeDto } from './dto/curadoria.dto';

// Curadoria de edital (T-197). ADMIN-only e auditado — mesmo trio do módulo.
// Conserta o caso individual reportado pelo cliente ("esse edital tá errado").
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(AdminAuditInterceptor)
@Controller('admin/editais')
export class AdminEditaisController {
  constructor(private readonly curadoria: AdminCuradoriaService) {}

  @Get(':id')
  detalhe(@Param('id', ParseUUIDPipe) id: string): Promise<EditalCuradoria> {
    return this.curadoria.detalhe(id);
  }

  @Audit('edital.classificacao')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch(':id/classificacao')
  classificar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClassificacaoDto,
  ): Promise<void> {
    return this.curadoria.corrigirClassificacao(id, dto.isObra);
  }

  @Audit('edital.visibilidade')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch(':id/visibilidade')
  visibilidade(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VisibilidadeDto,
  ): Promise<void> {
    return this.curadoria.alternarVisibilidade(id, dto.oculto);
  }

  // Reprocessamento DELIBERADO de IA (§3.4, exceção pedida pela T-197). 202: a
  // extração roda em segundo plano.
  @Audit('edital.regenerar')
  @HttpCode(HttpStatus.ACCEPTED)
  @Post(':id/regenerar-resumo')
  regenerar(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.curadoria.regenerarResumo(id);
  }
}
