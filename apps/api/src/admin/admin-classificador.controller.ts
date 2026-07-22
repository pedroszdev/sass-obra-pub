import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AdminClassificadorService,
  FilaPagina,
} from './admin-classificador.service';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminGuard } from './admin.guard';
import { Audit } from './audit.decorator';

class FilaQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

class RevisarDto {
  @IsBoolean()
  obra!: boolean;
}

// Fila de revisão do classificador (T-191). ADMIN-only e auditado. Curadoria em
// massa de baixa confiança — SEM step-up (não é destrutivo; step-up por item
// atrapalharia o fluxo de revisar vários).
@UseGuards(JwtAuthGuard, AdminGuard)
@UseInterceptors(AdminAuditInterceptor)
@Controller('admin/classificador')
export class AdminClassificadorController {
  constructor(private readonly classificador: AdminClassificadorService) {}

  @Get()
  fila(@Query() q: FilaQueryDto): Promise<FilaPagina> {
    return this.classificador.fila(q.page ?? 1);
  }

  @Audit('classificador.review')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':editalId')
  revisar(
    @Param('editalId', ParseUUIDPipe) editalId: string,
    @Body() dto: RevisarDto,
  ): Promise<void> {
    return this.classificador.revisar(editalId, dto.obra);
  }
}
