import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { Municipio } from './municipio.entity';

// Municípios do IBGE: entidade + listagem por UF (GET /geo/municipios), que
// alimenta o seletor de município da busca.
@Module({
  imports: [TypeOrmModule.forFeature([Municipio])],
  controllers: [GeoController],
  providers: [GeoService],
  exports: [TypeOrmModule],
})
export class GeoModule {}
