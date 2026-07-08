import { Badge, Box, Card, Flex, Group, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { brlCompact, daysUntil } from '../lib/format';
import { situacaoInativa } from '../lib/situacao';
import classes from '../styles/cards.module.css';
import type { EditalListItem, Veredito } from '../types/edital';
import { FavoriteButton } from './FavoriteButton';

const VEREDITO_META: Record<Veredito, { label: string; color: string }> = {
  apto: { label: 'Apto', color: 'apto' },
  quase: { label: 'Quase lá', color: 'orange' },
  nao_apto: { label: 'Falta doc', color: 'alerta' },
  indefinido: { label: 'Sem dados', color: 'gray' },
};

// Linha de um edital na lista de resultados (estilo handoff PrumoLicita): rótulo
// mono (modalidade · município), objeto em destaque e, à direita, aptidão +
// valor + prazo + estrela. Card inteiro clicável → detalhe. Responsivo (T-32):
// no mobile a coluna da direita desce para baixo do objeto.
// `veredito` (T-53) aparece quando a lista é o filtro de aptidão.
export function EditalCard({
  edital,
  veredito,
}: {
  edital: EditalListItem;
  veredito?: Veredito | null;
}) {
  const dias = daysUntil(edital.prazoProposta);
  const temPrazo = Number.isFinite(dias);
  const prazoLabel = !temPrazo
    ? '—'
    : dias < 0
      ? 'Encerrado'
      : dias === 0
        ? 'Hoje'
        : `${dias} dias`;
  const prazoCor = temPrazo && dias >= 0 && dias <= 3 ? 'alerta.7' : 'dimmed';
  const v = veredito ? VEREDITO_META[veredito] : null;
  // Edital morto por situação (T-114): a busca já o esconde, mas a lista de
  // Salvos pode trazer um favorito que morreu depois — marca claramente.
  const morta = situacaoInativa(edital.situacao);

  return (
    <Card
      component={Link}
      to={`/editais/${edital.id}`}
      withBorder
      radius="md"
      p="md"
      className={classes.hoverCard}
      td="none"
      c="inherit"
    >
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        gap="sm"
        justify="space-between"
        align={{ base: 'stretch', sm: 'center' }}
      >
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text className="brand-label" lineClamp={1}>
            {edital.modalidadeNome} · {edital.municipioNome} / {edital.uf}
          </Text>
          <Text
            fz={15.5}
            fw={600}
            ff="heading"
            lineClamp={2}
            mt={4}
            style={{ lineHeight: 1.3 }}
          >
            {edital.objeto}
          </Text>
          <Text fz={12.5} c="dimmed" mt={3} lineClamp={1}>
            {edital.orgaoNome}
          </Text>
        </Box>

        <Group
          gap="md"
          wrap="nowrap"
          align="center"
          justify="flex-end"
          style={{ flex: 'none' }}
        >
          {morta && (
            <Badge color="alerta" variant="light" radius="sm" tt="none">
              {morta}
            </Badge>
          )}
          {v && (
            <Badge color={v.color} variant="light" radius="sm" tt="none">
              {v.label}
            </Badge>
          )}
          <Text fz={14} fw={700} style={{ whiteSpace: 'nowrap' }}>
            {brlCompact(edital.valorEstimado)}
          </Text>
          <Text
            fz={13}
            fw={600}
            c={prazoCor}
            style={{ whiteSpace: 'nowrap', minWidth: 58, textAlign: 'right' }}
          >
            {prazoLabel}
          </Text>
          <FavoriteButton edital={edital} size="sm" />
        </Group>
      </Flex>
    </Card>
  );
}
