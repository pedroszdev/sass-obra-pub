import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Certidao } from '../company-profile/certidao.entity';
import { EditalExigencias } from '../editais/exigencias/edital-exigencias.entity';
import { Edital } from '../editais/edital.entity';
import { Favorito } from '../favoritos/favorito.entity';
import { Proposta } from '../propostas/proposta.entity';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';

// Agenda de prazos (T-91/T-112). Só lê (favoritos, editais, propostas,
// certidões e as exigências/resumo já extraídos) e agrega — sem entidade própria.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Favorito,
      Edital,
      Proposta,
      Certidao,
      EditalExigencias,
    ]),
  ],
  controllers: [AgendaController],
  providers: [AgendaService],
})
export class AgendaModule {}
