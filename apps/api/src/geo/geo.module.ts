import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Municipio } from './municipio.entity';

// Registra a entidade de municípios. A busca/uso vem com os endpoints (T-20).
@Module({
  imports: [TypeOrmModule.forFeature([Municipio])],
  exports: [TypeOrmModule],
})
export class GeoModule {}
