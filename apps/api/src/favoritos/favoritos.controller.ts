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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { EditalListItem } from '../editais/dto/edital-search-response';
import { CreateFavoritoDto } from './dto/create-favorito.dto';
import { FavoritosService } from './favoritos.service';

// Editais salvos do usuário logado (T-31). Só favoritar/listar — sem alertas.
@UseGuards(JwtAuthGuard)
@Controller('favoritos')
export class FavoritosController {
  constructor(private readonly favoritos: FavoritosService) {}

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post()
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFavoritoDto,
  ): Promise<void> {
    return this.favoritos.add(user.id, dto.editalId);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':editalId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('editalId', ParseUUIDPipe) editalId: string,
  ): Promise<void> {
    return this.favoritos.remove(user.id, editalId);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: EditalListItem[] }> {
    return this.favoritos.list(user.id);
  }
}
