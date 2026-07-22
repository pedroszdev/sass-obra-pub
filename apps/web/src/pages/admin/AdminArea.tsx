import { Route, Routes } from 'react-router-dom';
import { AdminAuditPage } from './AdminAuditPage';
import { AdminBuscasPage } from './AdminBuscasPage';
import { AdminCaptacaoPage } from './AdminCaptacaoPage';
import { AdminContaDetailPage } from './AdminContaDetailPage';
import { AdminContasPage } from './AdminContasPage';
import { AdminHomePage } from './AdminHomePage';
import { AdminLayout } from './AdminLayout';

// Raiz da área /admin e ALVO do lazy import em App.tsx (T-181). Tudo do admin
// (layout, home e as páginas futuras) vive neste módulo → cai num CHUNK separado,
// o primeiro code-splitting do app. As sub-rotas são relativas a /admin/*.
//
// Default export de propósito: `lazy(() => import('./pages/admin/AdminArea'))`
// espera um módulo com componente default.
export default function AdminArea() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<AdminHomePage />} />
        <Route path="contas" element={<AdminContasPage />} />
        <Route path="contas/:id" element={<AdminContaDetailPage />} />
        <Route path="captacao" element={<AdminCaptacaoPage />} />
        <Route path="buscas" element={<AdminBuscasPage />} />
        <Route path="auditoria" element={<AdminAuditPage />} />
        {/* Rota desconhecida dentro do admin volta à home do admin. */}
        <Route path="*" element={<AdminHomePage />} />
      </Route>
    </Routes>
  );
}
