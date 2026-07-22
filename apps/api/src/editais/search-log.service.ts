import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { capturarErro } from '../common/observabilidade';
import { SearchLog } from './search-log.entity';

export interface RegistroBusca {
  userId: string | null;
  termo?: string;
  ufs?: string[];
  municipios?: string[];
  valorMin?: number;
  valorMax?: number;
  total: number;
}

// Gravação do log de buscas (T-199). Separado do painel de leitura (admin): aqui
// é só o write, chamado pela busca. NUNCA bloqueia nem quebra a busca — é efeito
// colateral (como o e-mail no cadastro). Erro morre no log + Sentry.
@Injectable()
export class SearchLogService {
  private readonly logger = new Logger(SearchLogService.name);

  constructor(
    @InjectRepository(SearchLog)
    private readonly repo: Repository<SearchLog>,
  ) {}

  // Dispara a gravação sem esperar. O chamador NÃO deve dar await — a busca já
  // respondeu; um log lento não pode pendurar o request.
  registrarEmSegundoPlano(r: RegistroBusca): void {
    void this.registrar(r).catch((e: unknown) => {
      capturarErro(e, 'search-log.registrar');
      this.logger.warn(`Falha ao registrar busca: ${this.msg(e)}`);
    });
  }

  async registrar(r: RegistroBusca): Promise<void> {
    await this.repo.insert({
      userId: r.userId,
      termo: r.termo?.trim() ? r.termo.trim().slice(0, 200) : null,
      ufs: r.ufs?.length ? r.ufs : null,
      municipios: r.municipios?.length ? r.municipios : null,
      valorMin: r.valorMin ?? null,
      valorMax: r.valorMax ?? null,
      total: r.total,
    });
  }

  private msg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
}
