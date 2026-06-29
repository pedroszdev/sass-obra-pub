import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { RequireAuth } from './components/RequireAuth';
import { AgendaPage } from './pages/AgendaPage';
import { AlertasPage } from './pages/AlertasPage';
import { DocumentosPage } from './pages/DocumentosPage';
import { EditaisListPage } from './pages/EditaisListPage';
import { EditalDetailPage } from './pages/EditalDetailPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { OrcamentoEditorPage } from './pages/OrcamentoEditorPage';
import { OrcamentosPage } from './pages/OrcamentosPage';
import { PerfilPage } from './pages/PerfilPage';
import { SalvosPage } from './pages/SalvosPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/editais" element={<EditaisListPage />} />
        <Route path="/editais/:id" element={<EditalDetailPage />} />
        <Route path="/salvos" element={<SalvosPage />} />
        <Route path="/orcamentos" element={<OrcamentosPage />} />
        <Route path="/orcamentos/:id" element={<OrcamentoEditorPage />} />
        <Route path="/documentos" element={<DocumentosPage />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/alertas" element={<AlertasPage />} />
        <Route path="/perfil" element={<PerfilPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
