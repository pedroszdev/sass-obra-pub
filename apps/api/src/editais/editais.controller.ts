import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EditalSearchResult } from './dto/edital-search-response';
import { SearchEditaisDto } from './dto/search-editais.dto';
import { EditaisSearchService } from './editais-search.service';

// Busca de editais por região (T-20). Protegida — o produto é para o
// empreiteiro logado.
@UseGuards(JwtAuthGuard)
@Controller('editais')
export class EditaisController {
  constructor(private readonly search: EditaisSearchService) {}

  @Get()
  list(@Query() filtros: SearchEditaisDto): Promise<EditalSearchResult> {
    return this.search.search(filtros);
  }
}
