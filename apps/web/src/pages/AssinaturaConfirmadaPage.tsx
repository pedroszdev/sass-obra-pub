import {
  Box,
  Button,
  Card,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconArrowRight, IconCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { getPropostas, getProntidao } from '../lib/api';
import { fmtDate } from '../lib/format';
import { nomePlano } from '../lib/precos';
import type { Plano } from '../types/auth';

// Confirmação pós-pagamento (03/08).
//
// ⚠️ **Os cards de "o que fazer agora" só citam número que EXISTE.** O mockup
// trazia "desbloqueia 614 obras" — contagem que nenhum endpoint responde hoje.
// Escrever um número inventado numa tela de pós-venda é o erro que o §7 registra
// sobre telas mockadas, e aqui seria pior: a pessoa acabou de pagar por causa
// dele. Os que sobraram saem de `GET /company-profile/prontidao` e
// `GET /propostas`, que já devolvem o que é dito.
//
// ⚠️ **Nada aqui DECIDE acesso.** Quem ativa a assinatura é o webhook (§8); esta
// tela só relata o estado que o `/users/me` já traz.

interface EstadoNavegacao {
  plano?: Plano;
  ultimos4?: string;
  bandeira?: string;
}

interface Atalho {
  titulo: string;
  descricao: string;
  para: string;
}

export function AssinaturaConfirmadaPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: EstadoNavegacao | null };
  const { user } = useAuth();
  const [atalhos, setAtalhos] = useState<Atalho[]>([]);

  const assinatura = user?.assinatura ?? null;
  const plano = state?.plano ?? assinatura?.plano ?? 'mensal';

  // Chegar aqui sem ter passado pelo checkout não é erro do usuário — pode ser
  // um refresh ou um link colado. Manda para a assinatura, que mostra a verdade.
  useEffect(() => {
    if (!assinatura) navigate('/assinatura', { replace: true });
  }, [assinatura, navigate]);

  useEffect(() => {
    const ac = new AbortController();
    void Promise.allSettled([
      getProntidao(ac.signal),
      getPropostas(ac.signal),
    ]).then(([prontidao, propostas]) => {
      if (ac.signal.aborted) return;
      const lista: Atalho[] = [];

      if (prontidao.status === 'fulfilled') {
        // O item mais grave primeiro: não atendido vale mais que atenção.
        const pendente =
          prontidao.value.itens.find((i) => i.status === 'nao_atendido') ??
          prontidao.value.itens.find((i) => i.status === 'atencao');
        if (pendente) {
          lista.push({
            titulo: 'Complete seu cofre de documentos',
            // `motivo` vem do backend e já explica a pendência — não inventamos
            // texto sobre o documento de ninguém.
            descricao: `${pendente.label} — ${pendente.motivo}`,
            para: '/documentos',
          });
        }
      }

      if (propostas.status === 'fulfilled') {
        const rascunho = propostas.value.find(
          (p) => p.status === 'rascunho' && p.itensSemPreco > 0,
        );
        if (rascunho) {
          lista.push({
            titulo: `Termine a proposta de ${rascunho.titulo}`,
            descricao:
              rascunho.itensSemPreco === 1
                ? '1 item sem preço'
                : `${rascunho.itensSemPreco} itens sem preço`,
            para: `/orcamentos/${rascunho.id}`,
          });
        }
      }

      // Este não depende de dado: o plano não limita UFs, e é verdade sempre.
      lista.push({
        titulo: 'Monitore mais estados',
        descricao: 'O plano não limita UFs — adicione as regiões onde você atua.',
        para: '/perfil',
      });

      setAtalhos(lista);
    });
    return () => ac.abort();
  }, []);

  if (!assinatura) return null;

  return (
    <Stack p="lg" gap="lg" maw={780}>
      <div>
        <ThemeIcon color="apto.8" radius="xl" size={54}>
          <IconCheck size={30} />
        </ThemeIcon>
        <Title order={2} fz={30} ff="heading" mt="md">
          Assinatura confirmada.
        </Title>
        {/* ⚠️ O mockup prometia a NOTA FISCAL por e-mail. A NFS-e é a T-219,
            que está ABERTA e depende do CNPJ ativo — prometê-la aqui é prometer
            documento que não chega. O comprovante, esse existe (T-216). */}
        <Text c="dimmed" mt={6}>
          Seu acesso ao <strong>PrumoLicita Completo</strong> está liberado sem
          limites. O comprovante de cada cobrança fica no seu painel de
          assinatura.
        </Text>
      </div>

      <Card withBorder radius="md" p="lg">
        <Group gap="xl" wrap="wrap">
          {/* ⚠️ Só o NOME do plano. O `/users/me` não carrega o valor, e
              buscá-lo aqui só para exibir seria uma chamada a mais numa tela de
              confirmação — o valor exato está no painel de assinatura, a um
              clique. Escrever um número fixo aqui é que não. */}
          <Dado rotulo="PLANO" valor={nomePlano(plano)} />
          <Dado
            rotulo="PRÓXIMA COBRANÇA"
            valor={fmtDate(assinatura.currentPeriodEnd)}
          />
          {state?.ultimos4 && (
            <Dado
              rotulo="PAGAMENTO"
              valor={`•••• ${state.ultimos4}`}
              mono
            />
          )}
        </Group>
      </Card>

      {atalhos.length > 0 && (
        <div>
          <Text
            fz={11}
            fw={700}
            c="dimmed"
            style={{ letterSpacing: '0.08em' }}
            mb="xs"
          >
            O QUE FAZER AGORA
          </Text>
          <Stack gap="sm">
            {atalhos.map((a) => (
              <Card
                key={a.titulo}
                component={Link}
                to={a.para}
                withBorder
                radius="md"
                p="md"
                style={{ textDecoration: 'none' }}
              >
                <Group justify="space-between" wrap="nowrap" align="center">
                  <Box>
                    <Text fz="sm" fw={600}>
                      {a.titulo}
                    </Text>
                    <Text fz="xs" c="dimmed" mt={2}>
                      {a.descricao}
                    </Text>
                  </Box>
                  <IconArrowRight
                    size={16}
                    color="var(--mantine-color-orange-8)"
                    style={{ flex: 'none' }}
                  />
                </Group>
              </Card>
            ))}
          </Stack>
        </div>
      )}

      <Group gap="sm">
        <Button component={Link} to="/">
          Ir para o início
        </Button>
        <Button component={Link} to="/assinatura" variant="default">
          Ver minha assinatura
        </Button>
      </Group>
    </Stack>
  );
}

function Dado({
  rotulo,
  valor,
  mono,
}: {
  rotulo: string;
  valor: string;
  mono?: boolean;
}) {
  return (
    <Box>
      <Text fz={10} fw={700} c="dimmed" style={{ letterSpacing: '0.08em' }}>
        {rotulo}
      </Text>
      <Text fz="sm" fw={600} ff={mono ? 'monospace' : undefined} mt={2}>
        {valor}
      </Text>
    </Box>
  );
}
