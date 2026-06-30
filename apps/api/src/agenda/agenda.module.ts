import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Certidao } from '../company-profile/certidao.entity';
import { Edital } from '../editais/edital.entity';
import { Favorito } from '../favoritos/favorito.entity';
import { Proposta } from '../propostas/proposta.entity';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';

// Agenda de prazos (T-91). Só lê (repos de favoritos, editais, propostas e
// certidões) e agrega — não tem entidade própria.
@Module({
  imports: [TypeOrmModule.forFeature([Favorito, Edital, Proposta, Certidao])],
  controllers: [AgendaController],
  providers: [AgendaService],
})
export class AgendaModule {}
