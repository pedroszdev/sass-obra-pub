import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Edital } from '../editais/edital.entity';
import { Favorito } from './favorito.entity';
import { FavoritosController } from './favoritos.controller';
import { FavoritosService } from './favoritos.service';

// Favoritos do usuário (T-31). Usa o repo de Edital para validar/carregar os
// editais salvos.
@Module({
  imports: [TypeOrmModule.forFeature([Favorito, Edital])],
  controllers: [FavoritosController],
  providers: [FavoritosService],
})
export class FavoritosModule {}
