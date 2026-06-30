import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  EditalListItem,
  toEditalListItem,
} from '../editais/dto/edital-search-response';
import { Edital } from '../editais/edital.entity';
import { Favorito } from './favorito.entity';

@Injectable()
export class FavoritosService {
  constructor(
    @InjectRepository(Favorito)
    private readonly favoritos: Repository<Favorito>,
    @InjectRepository(Edital)
    private readonly editais: Repository<Edital>,
  ) {}

  // Salva um edital para o usuário. 404 se o edital não existe. Idempotente:
  // favoritar de novo não duplica (ON CONFLICT DO NOTHING sobre o UNIQUE).
  async add(userId: string, editalId: string): Promise<void> {
    const existe = await this.editais.count({ where: { id: editalId } });
    if (existe === 0) {
      throw new NotFoundException('Edital não encontrado');
    }
    await this.favoritos
      .createQueryBuilder()
      .insert()
      .values({ userId, editalId })
      .orIgnore()
      .execute();
  }

  // Remove o favorito. Idempotente — remover algo que não está salvo é no-op.
  async remove(userId: string, editalId: string): Promise<void> {
    await this.favoritos.delete({ userId, editalId });
  }

  // Lista os editais salvos do usuário, mais recentes primeiro. Duas queries
  // (favoritos → editais por id) para não depender de relação no ORM.
  async list(userId: string): Promise<{ data: EditalListItem[] }> {
    const favs = await this.favoritos.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const ids = favs.map((f) => f.editalId);
    if (ids.length === 0) {
      return { data: [] };
    }
    const editais = await this.editais.find({ where: { id: In(ids) } });
    const byId = new Map(editais.map((e) => [e.id, e]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((e): e is Edital => e !== undefined)
      // resumoPronto fica false aqui (T-83 marca o selo na busca/Início; o
      // status nos Salvos pode vir depois reusando o lookup do cache).
      .map((e) => toEditalListItem(e));
    return { data };
  }
}
