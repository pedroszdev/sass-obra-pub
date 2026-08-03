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
import { IconArrowRight, IconCheck, IconClock } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import {
  getPortalAssinante,
  getPropostas,
  getProntidao,
} from '../lib/api';
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
  const { user, refreshUser } = useAuth();
  const [atalhos, setAtalhos] = useState<Atalho[]>([]);

  const assinatura = user?.assinatura ?? null;
  const plano = state?.plano ?? assinatura?.plano ?? 'mensal';

  // 🔴 A tela tem DOIS desfechos, e confundi-los e mentir para quem pagou — ou
  // para quem NAO pagou. Ela e aberta por tres caminhos diferentes:
  //   - cartao: voltamos por navegacao interna, com a assinatura ja criada;
  //   - **Pix**: o provedor redireciona para ca pelo `successUrl`, que dispara
  //     "apos o pagamento com sucesso" — mas o WEBHOOK, que e quem libera o
  //     acesso (§8), pode chegar depois;
  //   - **boleto**: quem imprime o boleto paga no banco dias depois. Se ele
  //     cair aqui, nada foi pago ainda.
  //
  // Por isso o estado sai do `/users/me`, nunca do fato de a pagina ter sido
  // aberta. Afirmar "confirmada" por ter chegado ate aqui e exatamente o erro
  // que o `success_url` da Stripe ja ensinou a nao cometer (§8).
  const confirmada = assinatura?.status === 'active';
  const [pagarUrl, setPagarUrl] = useState<string | null>(null);

  // Chegar aqui sem ter passado pelo checkout nao e erro do usuario — pode ser
  // um refresh ou um link colado. Manda para a assinatura, que mostra a verdade.
  useEffect(() => {
    if (!assinatura) navigate('/assinatura', { replace: true });
  }, [assinatura, navigate]);

  /**
   * Reconsulta enquanto nao confirmar. O webhook leva alguns segundos, e quem
   * acabou de pagar por Pix chegaria aqui antes dele — vendo "aguardando" logo
   * depois de ter pago.
   *
   * Desiste em silencio: o estado "aguardando" e honesto e a tela continua util
   * (mostra o link de pagamento). Nada aqui DECIDE acesso, so rele (§3.3).
   */
  const aguardarConfirmacao = useCallback(async () => {
    for (let i = 0; i < 8; i++) {
      const me = await refreshUser().catch(() => null);
      if (me?.assinatura?.status === 'active') return;
      await new Promise((r) => setTimeout(r, 2500));
    }
  }, [refreshUser]);

  useEffect(() => {
    if (!confirmada) void aguardarConfirmacao();
    // Roda uma vez: o laco ja reconsulta sozinho, e redisparar a cada mudanca
    // de estado criaria varios lacos concorrentes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Link para pagar a cobranca em aberto — e o que salva o caminho do BOLETO,
  // em que a pessoa sai para pagar e volta sem ter pago.
  useEffect(() => {
    if (confirmada) return;
    const ac = new AbortController();
    getPortalAssinante(ac.signal)
      .then((p) => {
        const aberta = p.cobrancas.find(
          (c) => c.status === 'PENDING' || c.status === 'OVERDUE',
        );
        setPagarUrl(aberta?.pagarUrl ?? null);
      })
      .catch(() => setPagarUrl(null));
    return () => ac.abort();
  }, [confirmada]);

  useEffect(() => {
    if (!confirmada) return;
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
  }, [confirmada]);

  if (!assinatura) return null;

  return (
    <Stack p="lg" gap="lg" maw={780} mx="auto" w="100%">
      <div>
        <ThemeIcon
          color={confirmada ? 'apto.8' : 'alerta.7'}
          radius="xl"
          size={54}
        >
          {confirmada ? <IconCheck size={30} /> : <IconClock size={30} />}
        </ThemeIcon>
        <Title order={2} fz={30} ff="heading" mt="md">
          {confirmada ? 'Assinatura confirmada.' : 'Falta o pagamento.'}
        </Title>
        {/* ⚠️ O mockup prometia a NOTA FISCAL por e-mail. A NFS-e e a T-219,
            que esta ABERTA e depende do CNPJ ativo — promete-la aqui e prometer
            documento que nao chega. O comprovante, esse existe (T-216). */}
        {confirmada ? (
          <Text c="dimmed" mt={6}>
            Seu acesso ao <strong>PrumoLicita Completo</strong> esta liberado sem
            limites. O comprovante de cada cobranca fica no seu painel de
            assinatura.
          </Text>
        ) : (
          <Text c="dimmed" mt={6}>
            Sua cobranca foi gerada, mas o pagamento ainda nao foi compensado.
            Boleto costuma levar ate 3 dias uteis; Pix e na hora. Assim que o
            dinheiro entrar, seu acesso e liberado automaticamente — nao precisa
            fazer mais nada aqui.
          </Text>
        )}
        {!confirmada && pagarUrl && (
          <Button
            component="a"
            href={pagarUrl}
            target="_blank"
            rel="noopener noreferrer"
            mt="md"
          >
            Pagar agora
          </Button>
        )}
      </div>

      <Card withBorder radius="md" p="lg">
        <Group gap="xl" wrap="wrap">
          {/* ⚠️ Só o NOME do plano. O `/users/me` não carrega o valor, e
              buscá-lo aqui só para exibir seria uma chamada a mais numa tela de
              confirmação — o valor exato está no painel de assinatura, a um
              clique. Escrever um número fixo aqui é que não. */}
          <Dado rotulo="PLANO" valor={nomePlano(plano)} />
          <Dado
            rotulo={confirmada ? 'PRÓXIMA COBRANÇA' : 'VENCIMENTO'}
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

      {/* ⚠️ Só depois de confirmado. "O que fazer agora" numa tela que acabou de
          dizer "falta o pagamento" manda a pessoa para telas que o paywall vai
          barrar — e os proprios endpoints que alimentam estes cards respondem
          402 nesse estado. */}
      {confirmada && atalhos.length > 0 && (
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

      {/* Sem confirmacao, "Ir para o inicio" leva direto ao paywall. O destino
          util ali e a propria assinatura, onde a cobranca em aberto aparece. */}
      <Group gap="sm">
        {confirmada && (
          <Button component={Link} to="/">
            Ir para o início
          </Button>
        )}
        <Button
          component={Link}
          to="/assinatura"
          variant={confirmada ? 'default' : 'filled'}
        >
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
