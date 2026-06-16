import { Uf } from '../../common/uf';

// Critério de uma consulta a uma fonte: um período, numa UF.
// (Captação orientada à demanda — o job consulta as UFs dos usuários ativos.)
export interface EditalQuery {
  uf: Uf;
  dataInicial: Date;
  dataFinal: Date;
}
