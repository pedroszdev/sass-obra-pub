import {
  Alert,
  Box,
  Card,
  Center,
  Grid,
  Group,
  Loader,
  Radio,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { cnpjValido, formatarCnpj, soDigitos } from '../lib/cadastro';
import {
  assinarComCartao,
  criarCheckout,
  getCompanyProfile,
  getPrecos,
} from '../lib/api';
import {
  bandeiraDoNumero,
  formatarCep,
  formatarNumeroCartao,
  formatarValidade,
  numeroCartaoPlausivel,
  partesDaValidade,
  passaNoLuhn,
  tamanhoDoCvv,
  validadeExpirada,
} from '../lib/cartao';
import { montarResumo } from '../lib/checkout';
import { formatarTelefone, telefoneValido } from '../lib/telefone';
import { ResumoPedidoCard } from '../components/checkout/ResumoPedidoCard';
import type { MeioPagamento, Plano, PrecosResponse } from '../types/auth';

// Checkout próprio (03/08) — substitui o card de planos que mandava para fora.
//
// 🔴 **É a ÚNICA tela do produto, junto do CartaoModal, que coleta cartão.** As
// invariantes do SAQ A-EP valem inteiras aqui: nada em `localStorage`, nada em
// log, nada que sobreviva à navegação. Os campos morrem com o componente.
//
// ⚠️ Os DOIS meios saem por caminhos diferentes do Asaas, e isso não é detalhe
// de implementação — muda o que acontece ao confirmar:
//   - **cartão**: a assinatura é criada por NÓS (`POST /assinaturas/assinar-cartao`)
//     com o cartão deste formulário, e o cliente fica nesta página até confirmar;
//   - **boleto/Pix**: `POST /assinaturas/checkout` devolve a página HOSPEDADA da
//     1ª cobrança, e o navegador SAI daqui. Nenhum instrumento de pagamento
//     passa por nós nesse caminho.

export function CheckoutPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, refreshUser } = useAuth();

  const planoUrl = params.get('plano');
  const plano: Plano = planoUrl === 'anual' ? 'anual' : 'mensal';
  const [meio, setMeio] = useState<MeioPagamento>('cartao');

  const [precos, setPrecos] = useState<PrecosResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Cartão — nunca sai daqui a não ser na requisição.
  const [numero, setNumero] = useState('');
  const [validade, setValidade] = useState('');
  const [cvv, setCvv] = useState('');
  const [nome, setNome] = useState('');

  // Dados do titular. O Asaas EXIGE todos para cartão (antifraude) — o mockup
  // desenhava só quatro, e sem número do endereço e telefone a cobrança falha.
  const [razaoSocial, setRazaoSocial] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [cep, setCep] = useState('');
  const [numeroEndereco, setNumeroEndereco] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [tocado, setTocado] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const ac = new AbortController();
    setCarregando(true);
    // Preço e perfil juntos: a tela não serve para nada sem o primeiro, e o
    // segundo é o que evita redigitar o que já demos ao produto.
    void Promise.allSettled([
      getPrecos(ac.signal),
      getCompanyProfile(ac.signal),
    ]).then(([p, perfil]) => {
      if (ac.signal.aborted) return;
      if (p.status === 'fulfilled') setPrecos(p.value);
      if (perfil.status === 'fulfilled') {
        setRazaoSocial((v) => v || (perfil.value.profile?.razaoSocial ?? ''));
        setTelefone((v) => v || formatarTelefone(perfil.value.profile?.telefone ?? ''));
      }
      setCarregando(false);
    });
    return () => ac.abort();
  }, []);

  // ⚠️ O CNPJ e o e-mail vêm da CONTA, não do perfil: é o CNPJ da conta que vai
  // para o cliente no provedor e, um dia, para a NFS-e (T-219/T-225).
  useEffect(() => {
    if (user?.cnpj) setCnpj((v) => v || formatarCnpj(user.cnpj ?? ''));
    if (user?.email) setEmail((v) => v || user.email);
  }, [user?.cnpj, user?.email]);

  const trialEndsAt = useMemo(() => {
    const iso = user?.assinatura?.trialEndsAt;
    return iso ? new Date(iso) : null;
  }, [user?.assinatura?.trialEndsAt]);

  const resumo = useMemo(
    () => (precos ? montarResumo(plano, precos, trialEndsAt) : null),
    [precos, plano, trialEndsAt],
  );

  const pagandoComCartao = meio === 'cartao';
  const maxCvv = tamanhoDoCvv(bandeiraDoNumero(numero));

  // Erros que BLOQUEIAM. Boleto/Pix não pede cartão — o pagador escolhe e paga
  // na página hospedada do provedor.
  const erros: Record<string, string | undefined> = {
    numero:
      pagandoComCartao && !numeroCartaoPlausivel(numero)
        ? 'Número incompleto.'
        : undefined,
    validade: !pagandoComCartao
      ? undefined
      : !partesDaValidade(validade)
        ? 'Use o formato MM/AA.'
        : validadeExpirada(validade)
          ? 'Este cartão está vencido.'
          : undefined,
    cvv:
      pagandoComCartao && soDigitos(cvv).length !== maxCvv
        ? `O CVV tem ${maxCvv} dígitos.`
        : undefined,
    nome:
      pagandoComCartao && nome.trim().length < 3
        ? 'Informe o nome impresso no cartão.'
        : undefined,
    cnpj: !cnpjValido(cnpj) ? 'CNPJ inválido.' : undefined,
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? 'E-mail inválido.'
      : undefined,
    cep:
      pagandoComCartao && soDigitos(cep).length !== 8
        ? 'O CEP tem 8 dígitos.'
        : undefined,
    numeroEndereco:
      pagandoComCartao && !numeroEndereco.trim() ? 'Informe o número.' : undefined,
    telefone:
      pagandoComCartao && !telefoneValido(telefone)
        ? 'Telefone incompleto.'
        : undefined,
  };
  const valido = Object.values(erros).every((e) => !e);

  // ⚠️ AVISO, não erro: o Luhn reprova o cartão de teste do sandbox, então
  // bloquear por ele deixaria o caminho feliz intestável.
  const avisoLuhn =
    pagandoComCartao && numeroCartaoPlausivel(numero) && !passaNoLuhn(numero)
      ? 'Confira o número — ele não parece válido.'
      : null;

  const mostrar = (campo: string) => (tocado[campo] ? erros[campo] : undefined);
  const marcar = (campo: string) => () =>
    setTocado((t) => ({ ...t, [campo]: true }));

  /**
   * Espera o WEBHOOK liberar o acesso, em vez de perguntar uma vez só.
   *
   * ⚠️ Quem ativa a assinatura é o webhook (§8), não a resposta do cartão — e
   * ele leva alguns segundos. Um `refreshUser()` imediato quase sempre chega
   * cedo demais, e quem ACABOU de pagar veria a tela dizendo que não pagou.
   */
  const aguardarAtivacao = useCallback(async () => {
    for (let i = 0; i < 10; i++) {
      const me = await refreshUser().catch(() => null);
      if (me?.assinatura?.status === 'active') return;
      await new Promise((r) => setTimeout(r, 2500));
    }
  }, [refreshUser]);

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    try {
      if (!pagandoComCartao) {
        // Sai do app: a 1ª cobrança é paga na página hospedada, que serve
        // boleto E Pix. Não renderizamos linha digitável nem QR (T-216).
        const { url } = await criarCheckout(plano, meio);
        window.location.href = url;
        return;
      }
      const partes = partesDaValidade(validade);
      if (!partes) return;
      const { ultimos4, bandeira } = await assinarComCartao(plano, {
        cartao: {
          holderName: nome.trim().toUpperCase(),
          number: soDigitos(numero),
          expiryMonth: partes.mes,
          expiryYear: partes.ano,
          ccv: soDigitos(cvv),
        },
        titular: {
          name: razaoSocial.trim() || nome.trim(),
          email: email.trim(),
          cpfCnpj: soDigitos(cnpj),
          postalCode: soDigitos(cep),
          addressNumber: numeroEndereco.trim(),
          phone: soDigitos(telefone),
        },
      });
      await aguardarAtivacao();
      // ⚠️ Os últimos 4 vão pelo `state` da navegação, não pela URL: é dado do
      // cartão (mascarado, mas ainda assim) e URL fica em histórico e log.
      navigate('/assinatura/confirmada', {
        replace: true,
        state: { plano, ultimos4, bandeira },
      });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) {
    return (
      <Center h={320}>
        <Loader color="orange" />
      </Center>
    );
  }

  if (!precos || !resumo) {
    // Sem preço não há checkout: pedir cartão sem dizer o valor é o oposto de
    // honesto, e o backend responde 503 quando o preço não está configurado.
    return (
      <Stack p="lg" maw={620}>
        <Alert color="alerta">
          Não foi possível carregar os planos agora. Atualize a página em
          instantes.
        </Alert>
        <Text component={Link} to="/assinatura" fz="sm" c="orange.8">
          ← Voltar para planos
        </Text>
      </Stack>
    );
  }

  return (
    <Stack p="lg" gap="lg">
      <Text component={Link} to="/assinatura" fz="sm" c="orange.8" w="fit-content">
        ← Voltar para planos
      </Text>

      <Grid gutter="lg" align="flex-start">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Stack gap="lg">
            <Card withBorder radius="md" p="lg">
              <Title order={4} fz={17} ff="heading" mb="md">
                Forma de pagamento
              </Title>

              <Radio.Group
                value={meio}
                onChange={(v) => setMeio(v as MeioPagamento)}
              >
                <Group grow align="stretch" wrap="wrap">
                  <OpcaoMeio
                    valor="cartao"
                    titulo="Cartão de crédito"
                    ajuda="Renovação automática"
                  />
                  {/* ⚠️ O mockup dizia "Pix — só no plano anual". Não é como
                      funciona: usamos `billingType: UNDEFINED` (T-208), em que o
                      PAGADOR escolhe boleto ou Pix a cada cobrança, nos dois
                      planos. Restringir ao anual seria regra de negócio nova. */}
                  <OpcaoMeio
                    valor="boleto_pix"
                    titulo="Boleto ou Pix"
                    ajuda="Você escolhe a cada cobrança"
                  />
                </Group>
              </Radio.Group>

              {pagandoComCartao ? (
                <Stack gap="sm" mt="lg">
                  <TextInput
                    label="Número do cartão"
                    placeholder="0000 0000 0000 0000"
                    value={numero}
                    onChange={(e) =>
                      setNumero(formatarNumeroCartao(e.currentTarget.value))
                    }
                    onBlur={marcar('numero')}
                    error={mostrar('numero')}
                    inputMode="numeric"
                    autoComplete="cc-number"
                  />
                  {avisoLuhn && !mostrar('numero') && (
                    <Text fz="xs" c="alerta.6" mt={-6}>
                      {avisoLuhn}
                    </Text>
                  )}
                  <Group grow align="flex-start">
                    <TextInput
                      label="Validade"
                      placeholder="MM/AA"
                      value={validade}
                      onChange={(e) =>
                        setValidade(formatarValidade(e.currentTarget.value))
                      }
                      onBlur={marcar('validade')}
                      error={mostrar('validade')}
                      inputMode="numeric"
                      autoComplete="cc-exp"
                    />
                    <TextInput
                      label="CVC"
                      placeholder={'0'.repeat(maxCvv)}
                      value={cvv}
                      onChange={(e) =>
                        setCvv(soDigitos(e.currentTarget.value).slice(0, maxCvv))
                      }
                      onBlur={marcar('cvv')}
                      error={mostrar('cvv')}
                      inputMode="numeric"
                      autoComplete="cc-csc"
                    />
                  </Group>
                  <TextInput
                    label="Nome no cartão"
                    placeholder="Como aparece no cartão"
                    value={nome}
                    onChange={(e) => setNome(e.currentTarget.value)}
                    onBlur={marcar('nome')}
                    error={mostrar('nome')}
                    autoComplete="cc-name"
                    maxLength={100}
                  />
                </Stack>
              ) : (
                <Text fz="sm" c="dimmed" mt="lg">
                  Você será levado à página segura do provedor para pagar a
                  primeira cobrança. Boleto e Pix ficam disponíveis lá, e você
                  escolhe na hora.
                </Text>
              )}
            </Card>

            <Card withBorder radius="md" p="lg">
              <Group justify="space-between" align="baseline" mb="md">
                <Title order={4} fz={17} ff="heading">
                  Dados de cobrança
                </Title>
                <Text fz="xs" c="dimmed">
                  preenchido do seu perfil
                </Text>
              </Group>

              <Stack gap="sm">
                <Group grow align="flex-start">
                  <TextInput
                    label="Razão social"
                    placeholder="Nome da empresa"
                    value={razaoSocial}
                    onChange={(e) => setRazaoSocial(e.currentTarget.value)}
                    maxLength={255}
                  />
                  <TextInput
                    label="CNPJ"
                    placeholder="00.000.000/0000-00"
                    value={cnpj}
                    onChange={(e) => setCnpj(formatarCnpj(e.currentTarget.value))}
                    onBlur={marcar('cnpj')}
                    error={mostrar('cnpj')}
                    inputMode="numeric"
                  />
                </Group>
                <Group grow align="flex-start">
                  <TextInput
                    label="CEP"
                    placeholder="00000-000"
                    value={cep}
                    onChange={(e) => setCep(formatarCep(e.currentTarget.value))}
                    onBlur={marcar('cep')}
                    error={mostrar('cep')}
                    inputMode="numeric"
                  />
                  <TextInput
                    label="E-mail"
                    placeholder="voce@empresa.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.currentTarget.value)}
                    onBlur={marcar('email')}
                    error={mostrar('email')}
                    type="email"
                    maxLength={255}
                  />
                </Group>
                {/* ⚠️ Estes dois NÃO estavam no mockup, e não são enfeite: o
                    Asaas os exige na análise antifraude do cartão. Sem eles a
                    cobrança volta 400. */}
                {pagandoComCartao && (
                  <Group grow align="flex-start">
                    <TextInput
                      label="Número do endereço"
                      placeholder="123"
                      value={numeroEndereco}
                      onChange={(e) =>
                        setNumeroEndereco(e.currentTarget.value.slice(0, 10))
                      }
                      onBlur={marcar('numeroEndereco')}
                      error={mostrar('numeroEndereco')}
                      maxLength={10}
                    />
                    <TextInput
                      label="Telefone"
                      placeholder="(00) 00000-0000"
                      value={telefone}
                      onChange={(e) =>
                        setTelefone(formatarTelefone(e.currentTarget.value))
                      }
                      onBlur={marcar('telefone')}
                      error={mostrar('telefone')}
                      inputMode="numeric"
                    />
                  </Group>
                )}
              </Stack>
            </Card>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="md">
            {erro && <Alert color="alerta">{erro}</Alert>}
            <ResumoPedidoCard
              plano={plano}
              resumo={resumo}
              onTrocarPlano={() =>
                setParams(
                  { plano: plano === 'anual' ? 'mensal' : 'anual' },
                  { replace: true },
                )
              }
              onConfirmar={() => void confirmar()}
              confirmando={enviando}
              desabilitado={!valido}
              rotuloBotao={
                pagandoComCartao ? 'Confirmar assinatura' : 'Ir para o pagamento'
              }
            />
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

function OpcaoMeio({
  valor,
  titulo,
  ajuda,
}: {
  valor: MeioPagamento;
  titulo: string;
  ajuda: string;
}) {
  return (
    <Radio.Card value={valor} p="sm" radius="md" withBorder>
      <Group gap={10} wrap="nowrap" align="center">
        <Radio.Indicator />
        <Box>
          <Text fz="sm" fw={600}>
            {titulo}
          </Text>
          <Text fz="xs" c="dimmed">
            {ajuda}
          </Text>
        </Box>
      </Group>
    </Radio.Card>
  );
}
