import type { AuditFilter } from '../types/admin';

// Monta a querystring da consulta de auditoria (T-182). Extraída como função pura
// para testar sem montar componente (padrão lib/* do projeto). Só inclui o que
// está preenchido — campo vazio não vira `?acao=` inútil.
export function montarQueryAuditoria(filtro: AuditFilter): string {
  const sp = new URLSearchParams();
  if (filtro.desde) sp.set('desde', filtro.desde);
  if (filtro.ate) sp.set('ate', filtro.ate);
  if (filtro.acao && filtro.acao.trim()) sp.set('acao', filtro.acao.trim());
  if (filtro.page != null) sp.set('page', String(filtro.page));
  if (filtro.pageSize != null) sp.set('pageSize', String(filtro.pageSize));
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}
