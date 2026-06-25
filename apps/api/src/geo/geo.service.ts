import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Uf } from '../common/uf';
import { MunicipioResponse } from './dto/municipio-response';
import { Municipio } from './municipio.entity';

// Lista os municípios do IBGE por UF. A base já tem os 5.571 municípios semeados
// (ver seed); aqui só servimos o recorte da UF para o seletor do front.
@Injectable()
export class GeoService {
  constructor(
    @InjectRepository(Municipio)
    private readonly municipios: Repository<Municipio>,
  ) {}

  async listByUf(uf: Uf): Promise<MunicipioResponse[]> {
    const rows = await this.municipios.find({
      where: { uf },
      select: { codigoIbge: true, nome: true },
      // Ordem alfabética estável e tolerante a acento (coluna sem acento/caixa).
      order: { nomeNormalizado: 'ASC' },
    });
    return rows.map((m) => ({ codigoIbge: m.codigoIbge, nome: m.nome }));
  }
}
