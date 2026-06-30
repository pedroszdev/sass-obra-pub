import { createContext, useContext } from 'react';
import type { AlertaItem } from '../types/alerta';

export interface AlertasContextValue {
  itens: AlertaItem[];
  naoLidos: number;
  loading: boolean;
  reload: () => void;
  /** Marca tudo como lido (zera o sino). */
  marcarLido: () => void;
}

export const AlertasContext = createContext<AlertasContextValue | null>(null);

export function useAlertas(): AlertasContextValue {
  const ctx = useContext(AlertasContext);
  if (!ctx) {
    throw new Error('useAlertas deve ser usado dentro de <AlertasProvider>');
  }
  return ctx;
}
