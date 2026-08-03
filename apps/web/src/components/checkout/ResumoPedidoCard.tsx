import { Box, Button, Divider, Group, Stack, Text } from '@mantine/core';
import { IconCheck, IconFileText, IconLock } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import type { ResumoPedido } from '../../lib/checkout';
import { fmtDate } from '../../lib/format';
import { precoBRL } from '../../lib/precos';
import type { Plano } from '../../types/auth';

// Coluna escura do checkout: o que a pessoa está comprando e quanto sai do
// bolso HOJE. Fica ao lado do formulário de propósito — número de cobrança que
// só aparece depois de preencher cartão é o que gera estorno.
//
// ⚠️ Nenhum valor é calculado aqui. A conta é a `montarResumo` (pura, testada);
// este arquivo só desenha o que ela devolveu.

interface Props {
  plano: Plano;
  resumo: ResumoPedido;
  onTrocarPlano: () => void;
  onConfirmar: () => void;
  confirmando: boolean;
  desabilitado: boolean;
  rotuloBotao: string;
}

export function ResumoPedidoCard({
  plano,
  resumo,
  onTrocarPlano,
  onConfirmar,
  confirmando,
  desabilitado,
  rotuloBotao,
}: Props) {
  const gratisHoje = resumo.cobrancaHojeCentavos === 0;

  return (
    <Stack gap="md">
      <Box
        p="lg"
        style={{
          background: 'var(--mantine-color-graphite-9)',
          borderRadius: 'var(--mantine-radius-md)',
        }}
      >
        <Text fz={11} fw={700} c="graphite.4" style={{ letterSpacing: '0.08em' }}>
          RESUMO
        </Text>

        <Text ff="heading" fz={20} fw={700} c="white" mt={8}>
          PrumoLicita Completo
        </Text>
        <Group gap={8} mt={2}>
          <Text fz="sm" c="graphite.3">
            {plano === 'anual' ? 'Plano anual' : 'Plano mensal'}
          </Text>
          {/* Trocar de plano SEM sair do checkout e perder o que já digitou. */}
          <Text
            component="button"
            type="button"
            onClick={onTrocarPlano}
            fz="sm"
            c="orange.6"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            trocar
          </Text>
        </Group>

        <Divider my="md" color="graphite.7" />

        <Stack gap={8}>
          {resumo.linhas.map((linha) => (
            <Group key={linha.rotulo} justify="space-between" wrap="nowrap">
              <Text fz="sm" c="graphite.2">
                {linha.rotulo}
              </Text>
              <Text
                ff="monospace"
                fz="sm"
                c={linha.destaque ? 'apto.5' : 'graphite.0'}
              >
                {linha.valorCentavos < 0 ? '−' : ''}
                {precoBRL(Math.abs(linha.valorCentavos))}
              </Text>
            </Group>
          ))}
        </Stack>

        <Divider my="md" color="graphite.7" />

        <Group justify="space-between" align="baseline" wrap="nowrap">
          <Text fz="md" fw={700} c="white">
            Cobrança hoje
          </Text>
          <Text ff="monospace" fz={26} fw={700} c={gratisHoje ? 'apto.5' : 'white'}>
            {precoBRL(resumo.cobrancaHojeCentavos)}
          </Text>
        </Group>

        {/* ⚠️ A frase do "depois" é a promessa de recorrência. Ela precisa dizer
            VALOR, DATA e PERIODICIDADE — sem os três, "cobrança hoje R$ 0" lê
            como "de graça", e o estorno vem no mês seguinte. */}
        <Text fz="xs" c="graphite.3" mt={6}>
          Depois{' '}
          <Text component="span" ff="monospace" c="graphite.1">
            {precoBRL(resumo.valorRecorrenteCentavos)}
          </Text>
          {resumo.primeiraCobranca &&
            ` em ${fmtDate(resumo.primeiraCobranca.toISOString())}`}
          , e a cada {resumo.mesesDoCiclo === 12 ? '12 meses' : 'mês'}.
        </Text>

        <Button
          fullWidth
          size="md"
          mt="md"
          loading={confirmando}
          disabled={desabilitado}
          onClick={onConfirmar}
        >
          {rotuloBotao}
        </Button>

        <Text fz="xs" c="graphite.4" ta="center" mt={10}>
          Ao confirmar você concorda com os{' '}
          <Text
            component={Link}
            to="/termos"
            target="_blank"
            fz="xs"
            c="orange.6"
            style={{ textDecoration: 'underline' }}
          >
            Termos
          </Text>
          . Cancele quando quiser.
        </Text>
      </Box>

      <Box
        p="md"
        style={{
          background: 'var(--mantine-color-body)',
          border: '1px solid var(--mantine-color-concreto-3)',
          borderRadius: 'var(--mantine-radius-md)',
        }}
      >
        <Stack gap={10}>
          {/* 🔴 A frase do mockup era "Dados de cartão nunca passam pela
              PrumoLicita" — e isso é FALSO desde 31/07: o cartão passa pelo
              nosso servidor, que é a decisão do escopo PCI SAQ A-EP. Declarar
              conformidade que não temos é pior que não declarar nada. O que
              está escrito abaixo é o que de fato garantimos e há teste
              provando: nada persistido, nada em log, nada na resposta. */}
          <Garantia icone={<IconLock size={15} />}>
            Não guardamos os dados do seu cartão
          </Garantia>
          <Garantia icone={<IconCheck size={15} />}>
            Cancele quando quiser, sem multa
          </Garantia>
          {/* ⚠️ "Nota fiscal automática" saiu daqui de propósito: a NFS-e é a
              T-219, que está ABERTA e depende do CNPJ ativo. Prometer nota que
              não é emitida é o erro que o §7 registra sobre telas mockadas. */}
          <Garantia icone={<IconFileText size={15} />}>
            Comprovante de cada cobrança no seu painel
          </Garantia>
        </Stack>
      </Box>
    </Stack>
  );
}

function Garantia({
  icone,
  children,
}: {
  icone: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Group gap={10} wrap="nowrap" align="flex-start">
      <Box c="apto.8" style={{ flex: 'none', marginTop: 2 }}>
        {icone}
      </Box>
      <Text fz="sm" c="dimmed">
        {children}
      </Text>
    </Group>
  );
}
