import { Center, Loader } from '@mantine/core';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { decidirAcessoAdmin } from '../lib/admin-access';

// Trava de rota da área /admin (T-181). Só ADMIN entra.
//
// ⚠️ O negado (usuário comum OU anônimo) é mandado para "/" — o MESMO destino da
// rota-coringa `*` de App.tsx — para ser INDISTINGUÍVEL de uma rota inexistente
// (não confirmar que a área existe). Espelha no front o 404 do AdminGuard (T-180).
// A trava real é o backend: qualquer chamada a /admin/* responde 404 a não-admin.
export function AdminRoute({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const acesso = decidirAcessoAdmin(status, user?.role);

  if (acesso === 'loading') {
    return (
      <Center h="100vh">
        <Loader color="orange" />
      </Center>
    );
  }
  if (acesso === 'deny') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
