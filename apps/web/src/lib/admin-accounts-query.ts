import type { AccountsFilter } from '../types/admin';

// Monta a querystring da lista de contas do admin (T-184). Função pura (padrão
// lib/*), só inclui o que está preenchido. `emailVerificado` vira '1'/'0'.
export function montarQueryContas(filtro: AccountsFilter): string {
  const sp = new URLSearchParams();
  if (filtro.email?.trim()) sp.set('email', filtro.email.trim());
  if (filtro.cnpj?.trim()) sp.set('cnpj', filtro.cnpj.trim());
  if (filtro.status) sp.set('status', filtro.status);
  if (filtro.emailVerificado != null)
    sp.set('emailVerificado', filtro.emailVerificado ? '1' : '0');
  if (filtro.cadastradoDe) sp.set('cadastradoDe', filtro.cadastradoDe);
  if (filtro.cadastradoAte) sp.set('cadastradoAte', filtro.cadastradoAte);
  if (filtro.page != null) sp.set('page', String(filtro.page));
  if (filtro.pageSize != null) sp.set('pageSize', String(filtro.pageSize));
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}