import { Box, Group, Stack, Text, Title } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { type ReactNode, useEffect, useState } from 'react';
import { getEditaisStats } from '../lib/api';
import { Logo } from './Logo';

// Painel escuro da esquerda, compartilhado por Login e Cadastro. Título e
// benefícios são por tela; o resto (contador ao vivo, promessa, textura) é a
// mesma marca — duplicá-lo faria as telas divergirem sozinhas.

export interface Beneficio {
  strong: string;
  rest: string;
}

const BENEFICIOS_PADRAO: Beneficio[] = [
  { strong: 'Obras da sua região,', rest: 'encontradas automaticamente' },
  { strong: 'A gente diz se você está apto', rest: 'antes de você perder tempo' },
  { strong: 'Edital de 80 páginas', rest: 'resumido em 1 tela' },
];

// Promessa do produto no lugar do depoimento do mock: o produto ainda não foi
// mostrado a usuários reais (CLAUDE.md §7), e prova social inventada é
// propaganda enganosa (CDC art. 37). Trocar por citação real quando houver cliente.
const PROMESSA = 'O resumo do edital economiza uma tarde inteira de leitura.';

export function AuthBrandPanel({
  titulo,
  beneficios = BENEFICIOS_PADRAO,
}: {
  titulo: ReactNode;
  beneficios?: Beneficio[];
}) {
  // Contador "ao vivo" (rota pública GET /editais/stats). Falhou? o card some —
  // nunca mostramos um número inventado sob um selo que diz "ao vivo".
  const [abertos, setAbertos] = useState<number | null>(null);

  useEffect(() => {
    let ativo = true;
    getEditaisStats()
      .then((s) => ativo && setAbertos(s.abertos))
      .catch(() => {
        /* sem número: o card não renderiza */
      });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <Box
      visibleFrom="md"
      py={48}
      px={56}
      style={{
        flex: '0 0 44%',
        minWidth: 480,
        backgroundColor: 'var(--mantine-color-graphite-9)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Textura de fio de prumo — listras verticais quase imperceptíveis. */}
      <Box
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(236,231,223,0.025) 0px, rgba(236,231,223,0.025) 1px, transparent 1px, transparent 88px)',
        }}
      />
      <Box style={{ position: 'relative' }}>
        <Logo variant="onDark" size={30} />
      </Box>

      <Stack gap={32} maw={460} style={{ position: 'relative' }}>
        <Title
          order={1}
          c="concreto.2"
          fz={46}
          lh={1.08}
          style={{ letterSpacing: '-0.02em' }}
        >
          {titulo}
        </Title>

        {/* Só renderiza com número real vindo do backend. */}
        {abertos != null && (
          <Group
            wrap="nowrap"
            align="center"
            gap={20}
            style={{
              background: 'rgba(236,231,223,0.06)',
              border: '1px solid rgba(236,231,223,0.14)',
              borderRadius: 14,
              padding: '20px 24px',
            }}
          >
            <Box>
              <Text
                fz={34}
                fw={800}
                c="orange.6"
                ff="heading"
                style={{ letterSpacing: '-0.01em', lineHeight: 1.1 }}
              >
                {abertos.toLocaleString('pt-BR')}
              </Text>
              <Text fz="sm" c="concreto.5" mt={4}>
                licitações de obra abertas agora no Brasil
              </Text>
            </Box>
            <Group gap={7} wrap="nowrap" ml="auto">
              <Box
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--mantine-color-apto-6)',
                }}
              />
              <Text
                fz={12}
                fw={600}
                c="apto.4"
                style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
              >
                ao vivo
              </Text>
            </Group>
          </Group>
        )}

        <Stack gap={14}>
          {beneficios.map((p) => (
            <Group key={p.strong} gap={12} wrap="nowrap" align="baseline">
              <IconCheck size={16} color="var(--mantine-color-orange-6)" stroke={3} />
              <Text c="concreto.4" fz="md" lh={1.4}>
                <Text span c="concreto.2" fw={600}>
                  {p.strong}
                </Text>{' '}
                {p.rest}
              </Text>
            </Group>
          ))}
        </Stack>
      </Stack>

      <Box
        maw={460}
        pt={24}
        style={{
          position: 'relative',
          borderTop: '1px solid rgba(236,231,223,0.12)',
        }}
      >
        <Text fz={15} lh={1.55} c="concreto.5" fs="italic">
          “{PROMESSA}”
        </Text>
      </Box>
    </Box>
  );
}
