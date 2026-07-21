// Contrato do backoffice (Épico 15). Espelha apps/api/src/admin.

export interface AdminAuditEntry {
  id: string;
  adminUserId: string;
  action: string;
  method: string;
  path: string;
  targetId: string | null;
  statusCode: number;
  ip: string | null;
  summary: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminAuditPage {
  data: AdminAuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// Filtro da consulta de auditoria (T-182). Datas em ISO (o backend aceita
// data ou data-hora).
export interface AuditFilter {
  desde?: string;
  ate?: string;
  acao?: string;
  page?: number;
  pageSize?: number;
}
