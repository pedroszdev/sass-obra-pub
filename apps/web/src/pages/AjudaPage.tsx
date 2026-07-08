import {
  Accordion,
  Anchor,
  Box,
  Card,
  Group,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconMail, IconMessageCircle } from '@tabler/icons-react';

// E-mail de suporte — PLACEHOLDER (T-122). Trocar pelo canal real do dono
// (e-mail ou WhatsApp) quando definido.
const SUPORTE_EMAIL = 'suporte@prumolicita.com.br';

const FAQ: { q: string; a: string }[] = [
  {
    q: 'De onde vêm os editais?',
    a: 'Captamos as licitações de obra pública direto de fontes oficiais, principalmente o PNCP (Portal Nacional de Contratações Públicas). Buscamos por região (UF e municípios) e filtramos só o que é obra. Sempre há o link para o documento original na fonte.',
  },
  {
    q: 'O que é a "prontidão" e o diagnóstico de aptidão?',
    a: 'A prontidão cruza o seu perfil (certidões, atestados, capital, registro no CREA/CAU) com as exigências de habilitação — no geral e por edital específico. Ela diz se você está apto, quase apto ou o que falta. É apoio à decisão: confira sempre o edital.',
  },
  {
    q: 'Quais são os limites do resumo e da extração por IA?',
    a: 'O resumo do edital, as exigências e os itens da planilha são gerados por inteligência artificial e podem conter erros ou omissões. Use como um atalho para entender o edital rápido — a leitura do documento oficial continua sendo sua responsabilidade.',
  },
  {
    q: 'Como funciona o cofre de documentos?',
    a: 'Você guarda suas certidões e atestados (com os PDFs anexados) uma vez, e eles são reaproveitados no diagnóstico de cada edital. Avisamos quando uma certidão está perto de vencer.',
  },
  {
    q: 'Como monto uma proposta?',
    a: 'A partir de um edital, você cria uma proposta: importamos os itens da planilha (quando disponível), você ajusta preços e BDI, e exportamos em CSV para abrir no Excel. Um cronograma físico-financeiro simples também está disponível.',
  },
  {
    q: 'Como funciona a cobrança / o plano?',
    a: 'A assinatura ainda está em construção. Enquanto isso, o acesso está liberado. Quando o plano existir, você verá o status e o vencimento nas configurações.',
  },
  {
    q: 'Como exporto ou excluo meus dados?',
    a: 'Em Configurações › Segurança › "Seus dados" você pode baixar tudo o que guardamos (LGPD) ou excluir sua conta e os dados associados. A exclusão é definitiva.',
  },
];

export function AjudaPage() {
  return (
    <Box style={{ flex: 1 }} px={{ base: 'md', sm: 'xl' }} py="lg" pb={44}>
      <Box maw={760} mx="auto">
        <Title order={1} fz={26} mb="xs" style={{ letterSpacing: '-0.01em' }}>
          Ajuda
        </Title>
        <Text c="dimmed" fz="sm" mb="lg">
          Perguntas frequentes e como falar com a gente.
        </Text>

        <Card withBorder radius="lg" p="lg" mb="xl">
          <Group gap="md" wrap="nowrap" align="flex-start">
            <ThemeIcon variant="light" color="orange" radius="md" size={44} style={{ flex: 'none' }}>
              <IconMessageCircle size={22} />
            </ThemeIcon>
            <Box>
              <Text fz={16} fw={700} ff="heading">
                Precisa de ajuda?
              </Text>
              <Text fz={13.5} c="dimmed" mt={2}>
                Escreva pra gente — respondemos por e-mail.
              </Text>
              <Anchor
                href={`mailto:${SUPORTE_EMAIL}`}
                fw={600}
                mt="sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <IconMail size={16} />
                {SUPORTE_EMAIL}
              </Anchor>
            </Box>
          </Group>
        </Card>

        <Text className="brand-label" mb="sm">
          Perguntas frequentes
        </Text>
        <Accordion variant="separated" radius="md">
          {FAQ.map((item, i) => (
            <Accordion.Item key={i} value={String(i)}>
              <Accordion.Control>
                <Text fz={14.5} fw={600}>
                  {item.q}
                </Text>
              </Accordion.Control>
              <Accordion.Panel>
                <Text fz={13.5} c="gray.8" style={{ lineHeight: 1.6 }}>
                  {item.a}
                </Text>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </Box>
    </Box>
  );
}
