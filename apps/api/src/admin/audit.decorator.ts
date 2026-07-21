import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'admin_audit';

// Metadata de auditoria (T-182). Dois usos:
//   1. Em GET: marca a rota como auditável (o interceptor só audita leitura se
//      anotada — ex.: o detalhe de conta da T-184, `@Audit('account.view')`).
//   2. Em qualquer método: nomeia a ação. Sem label, o interceptor deriva de
//      `${método} ${rota}`.
//
// Mutações (POST/PUT/PATCH/DELETE) são auditadas mesmo SEM o decorator — ele só
// refina o rótulo. O decorator é OBRIGATÓRIO para auditar um GET.
export const Audit = (action?: string) =>
  SetMetadata(AUDIT_KEY, action ?? true);
