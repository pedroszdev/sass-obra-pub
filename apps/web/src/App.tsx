import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { RequireAuth } from './components/RequireAuth';
import { AgendaPage } from './pages/AgendaPage';
import { AjudaPage } from './pages/AjudaPage';
import { AlertasPage } from './pages/AlertasPage';
import { DocumentosPage } from './pages/DocumentosPage';
import { EditaisListPage } from './pages/EditaisListPage';
import { EditalDetailPage } from './pages/EditalDetailPage';
import { EntrandoPage } from './pages/EntrandoPage';
import { EsqueciSenhaPage } from './pages/EsqueciSenhaPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { OrcamentoEditorPage } from './pages/OrcamentoEditorPage';
import { OrcamentoImprimirPage } from './pages/OrcamentoImprimirPage';
import { OrcamentosPage } from './pages/OrcamentosPage';
import { PerfilPage } from './pages/PerfilPage';
import { PrivacidadePage } from './pages/PrivacidadePage';
import { RedefinirSenhaPage } from './pages/RedefinirSenhaPage';
import { RegisterPage } from './pages/RegisterPage';
import { SalvosPage } from './pages/SalvosPage';
import { TermosPage } from './pages/TermosPage';
import { VerificarEmailPage } from './pages/VerificarEmailPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/cadastro" element={<RegisterPage />} />
      <Route path="/esqueci-senha" element={<EsqueciSenhaPage />} />
      <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />
      <Route path="/verificar-email" element={<VerificarEmailPage />} />
      {/* Volta do Google por redirect (T-126b): pega a sessão pelo cookie e
          roteia. Não usa RequireAuth — chega aqui SEM access token, é justamente
          onde ele é obtido. */}
      <Route path="/entrando" element={<EntrandoPage />} />
      {/* Páginas legais públicas (T-102/LGPD). */}
      <Route path="/termos" element={<TermosPage />} />
      <Route path="/privacidade" element={<PrivacidadePage />} />
      {/* Onboarding é tela cheia (sem o shell), como o Login — mas exige auth. */}
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />
      {/* Impressão da proposta — tela limpa (sem o shell) para "Salvar como PDF". */}
      <Route
        path="/orcamentos/:id/imprimir"
        element={
          <RequireAuth>
            <OrcamentoImprimirPage />
          </RequireAuth>
        }
      />
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
        <Route path="/ajuda" element={<AjudaPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
