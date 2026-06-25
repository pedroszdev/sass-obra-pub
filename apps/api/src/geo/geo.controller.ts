import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListMunicipiosDto } from './dto/list-municipios.dto';
import { MunicipioResponse } from './dto/municipio-response';
import { GeoService } from './geo.service';

// Municípios do IBGE por UF, para o seletor de município da busca. Protegido —
// como o resto do produto, é para o empreiteiro logado.
@UseGuards(JwtAuthGuard)
@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('municipios')
  municipios(@Query() query: ListMunicipiosDto): Promise<MunicipioResponse[]> {
    return this.geo.listByUf(query.uf);
  }
}
