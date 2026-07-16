import { Alert, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AssinanteCard } from '../components/assinatura/AssinanteCard';
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
  getPrecos,
} from '../lib/api';
import type { DetalhesAssinatura, Plano, PrecosResponse } from '../types/auth';

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

  useEffect(() => {
    const ac = new AbortController();
    getDetalhesAssinatura(ac.signal)
      .then(setDetalhes)
      .catch(() => setDetalhes(null))
      .finally(() => !ac.signal.aborted && setCarregandoDetalhes(false));
    return () => ac.abort();
  }, [assinatura?.status, assinatura?.plano]);

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
        <Alert
          color="alerta"
          icon={<IconAlertTriangle size={18} />}
          title="Não conseguimos cobrar seu cartão"
        >
          Atualize a forma de pagamento para não perder o acesso. Você continua
          usando durante alguns dias enquanto tentamos de novo.
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
            onAssinar={() => void irPara('checkout', () => criarCheckout(plano))}
            assinando={carregando === 'checkout'}
            jaPagou={assinatura.status === 'canceled'}
          />
        </>
      )}

      {assinatura && assinante && (
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
