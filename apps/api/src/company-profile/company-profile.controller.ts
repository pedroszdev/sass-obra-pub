import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { CompanyProfileService } from './company-profile.service';
import {
  AtestadoResponse,
  CertidaoResponse,
  CompanyProfileResponse,
  CompanyProfileSnapshot,
} from './dto/company-profile-response';
import { CreateAtestadoDto } from './dto/create-atestado.dto';
import { CreateCertidaoDto } from './dto/create-certidao.dto';
import { UpdateAtestadoDto } from './dto/update-atestado.dto';
import { UpdateCertidaoDto } from './dto/update-certidao.dto';
import { UpsertCompanyProfileDto } from './dto/upsert-company-profile.dto';

// Perfil de habilitação do empreiteiro logado (BACKLOG T-41). Tudo escopado ao
// usuário do JWT — o user_id nunca vem do body. Operações por :id que não forem
// do dono respondem 404 (não vazam existência alheia).
@UseGuards(JwtAuthGuard)
@Controller('company-profile')
export class CompanyProfileController {
  constructor(private readonly profile: CompanyProfileService) {}

  @Get()
  getFull(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CompanyProfileSnapshot> {
    return this.profile.getFull(user.id);
  }

  @Put()
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertCompanyProfileDto,
  ): Promise<CompanyProfileResponse> {
    return this.profile.upsertProfile(user.id, dto);
  }

  @Post('certidoes')
  addCertidao(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCertidaoDto,
  ): Promise<CertidaoResponse> {
    return this.profile.addCertidao(user.id, dto);
  }

  @Put('certidoes/:id')
  updateCertidao(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCertidaoDto,
  ): Promise<CertidaoResponse> {
    return this.profile.updateCertidao(user.id, id, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('certidoes/:id')
  removeCertidao(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.profile.removeCertidao(user.id, id);
  }

  @Post('atestados')
  addAtestado(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAtestadoDto,
  ): Promise<AtestadoResponse> {
    return this.profile.addAtestado(user.id, dto);
  }

  @Put('atestados/:id')
  updateAtestado(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAtestadoDto,
  ): Promise<AtestadoResponse> {
    return this.profile.updateAtestado(user.id, id, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('atestados/:id')
  removeAtestado(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.profile.removeAtestado(user.id, id);
  }
}
