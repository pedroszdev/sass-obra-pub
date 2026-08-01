import { Alert, Button, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconExternalLink } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import {
  CobrancasCard,
  TrocarPlanoCard,
} from '../components/PortalAssinanteCard';
import { TrocarCartaoModal } from '../components/TrocarCartaoModal';
import { formaDeCobranca } from '../lib/cobranca';
import { fmtDate } from '../lib/format';
import { useSearchParams } from 'react-router-dom';
import { AssinanteCard } from '../components/assinatura/AssinanteCard';
import { CancelarAsaasCard } from '../components/assinatura/CancelarAsaasCard';
import { CancelarCard } from '../components/assinatura/CancelarCard';
import { FaturasCard } from '../components/assinatura/FaturasCard';
import { PlanosCard } from '../components/assinatura/PlanosCard';
import { TrialCard, TrialEncerradoCard } from '../components/assinatura/TrialCard';
import { useAuth } from '../context/auth-context';
import {
  abrirPortalAssinatura,
  ApiError,
  criarCheckout,
  getDetalhesAssinatura,
  getPortalAssinante,
  getPrecos,
} from '../lib/api';
import type {
  DetalhesAssinatura,
  Plano,
  MeioPagamento,
  PortalAssinante,
  PrecosResponse,
} from '../types/auth';

// Assinatura (T-131). O status vem TODO do backend (§3.3) — esta tela não decide
// nada, só renderiza e manda o usuário para a Stripe.
//
// O pagamento acontece no Checkout hospedado: nenhum dado de cartão passa por nós
// (LGPD/T-102 — a Stripe tokeniza). A gestão (trocar cartão, trocar de plano,
// cancelar) é o Customer Portal, também deles — por isso os botões saem daqui em
// vez de virarem tela nossa (§9).

export function AssinaturaPage() {
  const { user, refreshUser } = useAuth();
  const [params] = useSearchParams();
  const [carregando, setCarregando] = useState<'checkout' | 'portal' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [plano, setPlano] = useState<Plano>('anual');

  const [precos, setPrecos] = useState<PrecosResponse | null>(null);
  const [carregandoPrecos, setCarregandoPrecos] = useState(true);
  const [detalhes, setDetalhes] = useState<DetalhesAssinatura | null>(null);
  const [carregandoDetalhes, setCarregandoDetalhes] = useState(true);

  const assinatura = user?.assinatura ?? null;
  const ativa = assinatura?.status === 'active';
  const jaPagou = ativa || assinatura?.status === 'past_due';
  // Cancelada mas ainda com acesso: continua sendo a tela de assinante — ela só
  // não vai renovar. Quem já perdeu o acesso volta a ver os planos.
  const assinante = jaPagou || (assinatura?.status === 'canceled' && assinatura.acessoPermitido);
  // Cancelada: o que a tela oferece muda. Não há assinatura no provedor para
  // trocar cartão nem plano (T-217) — o que resta é reativar.
  const cancelada =
    assinatura?.status === 'canceled' || assinatura?.cancelAtPeriodEnd === true;

  // Volta do Checkout. NÃO confirma nada: quem confirma o pagamento é o webhook
  // (T-129). Este parâmetro é só navegação — um usuário pode digitá-lo na barra
  // de endereços.
  const voltouDoPagamento = params.get('status') === 'ok';

  // O estado se atualiza SOZINHO (não há botão de "atualizar"):
  //  - ao abrir a tela, busca o estado fresco (cobre a volta do Portal: cancelar,
  //    trocar cartão, trocar de plano);
  //  - voltando do pagamento, o webhook é assíncrono (leva segundos), então
  //    consulta em intervalos até a assinatura ficar ativa — ou desistir após um
  //    tempo (aí o "estamos confirmando" continua, e um reload resolve).
  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;
    let tentativas = 0;
    const MAX = voltouDoPagamento ? 10 : 1; // ~25s de espera após pagar
    const INTERVALO = 2500;

    async function checar() {
      if (!vivo) return;
      const me = await refreshUser().catch(() => null);
      tentativas += 1;
      const confirmado = me?.assinatura?.status === 'active';
      if (vivo && !confirmado && tentativas < MAX) {
        timer = setTimeout(() => void checar(), INTERVALO);
      }
    }
    void checar();

    return () => {
      vivo = false;
      clearTimeout(timer);
    };
    // refreshUser é estável (useCallback []); voltouDoPagamento não muda na vida
    // da tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preços e detalhes falham em SILÊNCIO de propósito: são complemento. Se a
  // Stripe estiver fora, a tela ainda mostra o status da assinatura (que vem do
  // nosso banco) em vez de virar um erro em tela cheia.
  useEffect(() => {
    const ac = new AbortController();
    getPrecos(ac.signal)
      .then(setPrecos)
      .catch(() => setPrecos(null))
      .finally(() => !ac.signal.aborted && setCarregandoPrecos(false));
    return () => ac.abort();
  }, []);

  // Portal do assinante (T-216). `temGestaoExterna` decide QUAL UI renderizar:
  // true = Stripe (botão do Customer Portal, o caminho de hoje); false = Asaas,
  // que não tem portal nenhum, e aí a tela é nossa.
  const [portal, setPortal] = useState<PortalAssinante | null>(null);
  const [meio, setMeio] = useState<MeioPagamento>('cartao');
  const [trocaAberta, setTrocaAberta] = useState(false);
  const [cartaoAberto, setCartaoAberto] = useState(false);
  // Mostra o cartão recém-trocado sem esperar a próxima cobrança aparecer.
  const [cartaoNovo, setCartaoNovo] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    getPortalAssinante(ac.signal)
      .then(setPortal)
      // Falha aqui não pode derrubar a tela: sem o portal, o usuário ainda
      // precisa ver o próprio plano. Cai no caminho da Stripe, que é o de hoje.
      .catch(() => setPortal(null))
      .finally(() => undefined);
    return () => ac.abort();
  }, [assinatura?.status, nonce]);

  useEffect(() => {
    const ac = new AbortController();
    getDetalhesAssinatura(ac.signal)
      .then(setDetalhes)
      .catch(() => setDetalhes(null))
      .finally(() => !ac.signal.aborted && setCarregandoDetalhes(false));
    return () => ac.abort();
  }, [assinatura?.status, assinatura?.plano]);

  // Como esta conta é cobrada, para o aviso de inadimplência não mentir.
  //
  // Na Stripe é sempre CARTÃO — conta brasileira não tem Pix Automático e o
  // boleto ficou de fora (§9). No Asaas o meio vem da própria cobrança, e pode
  // ser boleto, Pix ou "o pagador escolhe" (T-208). Sem cobrança em aberto para
  // consultar, o texto genérico ganha: melhor não citar meio nenhum do que
  // inventar um cartão que a pessoa não tem.
  const doAsaas = portal != null && !portal.temGestaoExterna;
  const cobrancaEmAberto = doAsaas
    ? portal.cobrancas.find(
        (c) => c.status === 'PENDING' || c.status === 'OVERDUE',
      )
    : undefined;
  const porCartao = !doAsaas || cobrancaEmAberto?.meio === 'CREDIT_CARD';

  const irPara = useCallback(
    async (acao: 'checkout' | 'portal', fn: () => Promise<{ url: string }>) => {
      setErro(null);
      setCarregando(acao);
      try {
        const { url } = await fn();
        window.location.href = url; // sai do app: o Checkout/Portal é da Stripe
      } catch (err) {
        setErro(
          err instanceof ApiError
            ? err.message
            : 'Não foi possível continuar. Tente de novo em instantes.',
        );
        setCarregando(null);
      }
    },
    [],
  );

  const abrirPortal = useCallback(
    () => void irPara('portal', abrirPortalAssinatura),
    [irPara],
  );

  return (
    <Stack p="lg" gap="lg" maw={780}>
      <div>
        <Title order={2} fz={24} ff="heading">
          Assinatura
        </Title>
        <Text c="dimmed" fz="sm" mt={4}>
          Seu plano e a forma de pagamento.
        </Text>
      </div>

      {voltouDoPagamento && !ativa && (
        // Honesto: o pagamento pode levar alguns segundos para ser confirmado
        // (o webhook precisa chegar). Dizer "assinatura ativa!" aqui seria mentir
        // com base num parâmetro de URL.
        <Alert color="blue" title="Estamos confirmando seu pagamento">
          Isso costuma levar alguns segundos. Atualize a página em instantes — o
          status abaixo muda sozinho quando a confirmação chegar.
        </Alert>
      )}

      {assinatura?.status === 'past_due' && (
        // ⚠️ O texto depende do MEIO. Dizer "não conseguimos cobrar seu cartão"
        // a quem paga por boleto ou Pix (T-208) é dar uma instrução impossível:
        // não existe cartão para atualizar, e a pessoa fica parada até o acesso
        // cair. O que existe é uma cobrança em aberto — e um botão para pagá-la.
        <Alert
          color="alerta"
          icon={<IconAlertTriangle size={18} />}
          title={
            porCartao
              ? 'Não conseguimos cobrar seu cartão'
              : 'Você tem uma cobrança em aberto'
          }
        >
          <Stack gap="xs" align="flex-start">
            <Text fz="sm">
              {porCartao
                ? 'Atualize a forma de pagamento para não perder o acesso.'
                : 'Pague a cobrança para não perder o acesso.'}{' '}
              {/* A DATA vem do backend (§3.3). "Alguns dias" não dizia se a
                  pessoa corre hoje ou na semana que vem. */}
              {assinatura.pastDueAte
                ? `Seu acesso continua até ${fmtDate(assinatura.pastDueAte)}.`
                : 'Seu acesso continua por alguns dias.'}
            </Text>
            {cobrancaEmAberto?.pagarUrl && (
              <Button
                component="a"
                href={cobrancaEmAberto.pagarUrl}
                target="_blank"
                rel="noopener noreferrer"
                size="xs"
                rightSection={<IconExternalLink size={14} />}
              >
                Pagar agora
              </Button>
            )}
          </Stack>
        </Alert>
      )}

      {erro && (
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Deu problema">
          {erro}
        </Alert>
      )}

      {assinatura && !assinante && (
        <>
          {assinatura.emTrial ? (
            <TrialCard assinatura={assinatura} />
          ) : (
            <TrialEncerradoCard assinatura={assinatura} />
          )}
          <PlanosCard
            precos={precos}
            carregandoPrecos={carregandoPrecos}
            plano={plano}
            onPlano={setPlano}
            // A escolha de meio só existe no Asaas; na Stripe o card nem mostra.
            meio={meio}
            onMeio={portal && !portal.temGestaoExterna ? setMeio : undefined}
            onAssinar={() =>
              void irPara('checkout', () => criarCheckout(plano, meio))
            }
            assinando={carregando === 'checkout'}
            jaPagou={assinatura.status === 'canceled'}
          />
        </>
      )}

      {assinatura && assinante && portal && !portal.temGestaoExterna && (
        <>
          {/* MESMO card da Stripe — o assinante vê a mesma tela nos dois
              provedores. O que muda são as ações: aqui não há portal
              hospedado (T-207), então a troca de plano é tela nossa. */}
          {/* ⚠️ Cancelada NÃO oferece trocar cartão nem trocar plano: não há
              assinatura no provedor para alterar (ela foi APAGADA, T-217), e
              botão que não faz nada é pior que botão ausente. O caminho de
              volta é reativar, abaixo. */}
          <AssinanteCard
            assinatura={assinatura}
            precos={precos}
            detalhes={detalhes}
            formaPagamento={cartaoNovo ?? formaDeCobranca(portal.cobrancas)}
            onTrocarPlano={cancelada ? undefined : () => setTrocaAberta((v) => !v)}
            onTrocarCartao={cancelada ? undefined : () => setCartaoAberto(true)}
          />
          {!cancelada && (
            <TrocarCartaoModal
              aberto={cartaoAberto}
              onFechar={() => setCartaoAberto(false)}
              onTrocado={(m) => {
                setCartaoNovo(`•••• ${m.ultimos4}`);
                setNonce((n) => n + 1);
              }}
            />
          )}
          {!cancelada && trocaAberta && (
            <TrocarPlanoCard
              planoAtual={assinatura.plano}
              onTrocado={() => {
                setTrocaAberta(false);
                setNonce((n) => n + 1);
              }}
            />
          )}

          {cancelada && (
            <>
              {/* 🔴 A DATA é o ponto: reativar NÃO cobra agora. O backend faz a
                  1ª cobrança cair no fim do período já pago (`primeiroVencimento`)
                  — sem isso, quem voltasse pagaria duas vezes o mesmo mês. */}
              <Alert color="blue" title="Quer voltar?">
                Sua assinatura foi cancelada, mas o acesso vale até{' '}
                <strong>{fmtDate(assinatura.currentPeriodEnd)}</strong>. Se
                reativar agora, <strong>nada é cobrado hoje</strong>: a próxima
                cobrança começa quando esse período terminar.
              </Alert>
              <PlanosCard
                precos={precos}
                carregandoPrecos={carregandoPrecos}
                plano={plano}
                onPlano={setPlano}
                meio={meio}
                onMeio={setMeio}
                onAssinar={() =>
                  void irPara('checkout', () => criarCheckout(plano, meio))
                }
                assinando={carregando === 'checkout'}
                jaPagou
              />
            </>
          )}
          <CobrancasCard cobrancas={portal.cobrancas} />
          {/* Cancelamento self-service (T-217). Aqui é NOSSO do começo ao fim —
              o Asaas não tem portal hospedado (T-207). */}
          <CancelarAsaasCard
            assinatura={assinatura}
            onCancelado={() => {
              // O status de quem manda na tela vem do `/users/me` (§3.3), não
              // da resposta do cancelamento — por isso recarrega em vez de
              // escrever estado local.
              void refreshUser();
              setNonce((n) => n + 1);
            }}
          />
        </>
      )}

      {assinatura && assinante && (!portal || portal.temGestaoExterna) && (
        <>
          <AssinanteCard
            assinatura={assinatura}
            precos={precos}
            detalhes={detalhes}
            onPortal={abrirPortal}
            abrindoPortal={carregando === 'portal'}
          />
          <FaturasCard
            assinatura={assinatura}
            detalhes={detalhes}
            carregando={carregandoDetalhes}
            onPortal={abrirPortal}
            abrindoPortal={carregando === 'portal'}
          />
          <CancelarCard
            assinatura={assinatura}
            onPortal={abrirPortal}
            abrindoPortal={carregando === 'portal'}
          />
        </>
      )}

      <Text fz="xs" c="dimmed">
        O pagamento é processado pela Stripe. Nenhum dado do seu cartão passa
        pelos nossos servidores.
      </Text>
    </Stack>
  );
}
