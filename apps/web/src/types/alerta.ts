// Central de notificações (T-90) — espelha a API. Alertas derivados do estado
// real; `novo` = relevante depois da última visita do usuário.
export type AlertaCat = 'obra' | 'prazo' | 'documento' | 'ia' | 'orcamento';

export interface AlertaItem {
  id: string;
  cat: AlertaCat;
  titulo: string;
  detalhe: string;
  data: string;
  novo: boolean;
  href: string;
}

export interface AlertasResult {
  itens: AlertaItem[];
  naoLidos: number;
}
