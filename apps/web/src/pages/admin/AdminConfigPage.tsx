import {
  Alert,
  Button,
  Card,
  Center,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import { getAdminConfig, salvarBanner, salvarTrialDias } from '../../lib/api';
import type { BannerNivel, ConfigAdmin } from '../../types/admin';

const NIVEIS: { value: BannerNivel; label: string }[] = [
  { value: 'info', label: 'Informação (azul)' },
  { value: 'aviso', label: 'Aviso (amarelo)' },
  { value: 'critico', label: 'Crítico (vermelho)' },
];

// Config operacional do backoffice (T-195): banner global de aviso + dias de
// trial editáveis, sem deploy nem SQL.
export function AdminConfigPage() {
  const [config, setConfig] = useState<ConfigAdmin | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    getAdminConfig()
      .then(setConfig)
      .catch((e: unknown) => setErro((e as Error).message))
      .finally(() => setCarregando(false));
  }, []);

  if (erro && !config) {
    return (
      <Alert color="red" title="Falha">
        {erro}
      </Alert>
    );
  }
  if (carregando || !config) {
    return (
      <Center py="xl">
        <Loader color="orange" />
      </Center>
    );
  }

  return (
    <Stack>
      <div>
        <Title order={2}>Configuração operacional</Title>
        <Text c="dimmed">
          Banner de aviso e parâmetros simples — mudam em runtime, sem deploy.
        </Text>
      </div>
      <BannerCard config={config} />
      <TrialCard config={config} />
    </Stack>
  );
}

function BannerCard({ config }: { config: ConfigAdmin }) {
  const [ativo, setAtivo] = useState(config.banner.ativo);
  const [nivel, setNivel] = useState<BannerNivel>(config.banner.nivel);
  const [mensagem, setMensagem] = useState(config.banner.mensagem);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(
    null,
  );

  async function salvar() {
    setSalvando(true);
    setAviso(null);
    try {
      await salvarBanner({ ativo, nivel, mensagem: mensagem.trim() });
      setAviso({ ok: true, texto: 'Banner salvo.' });
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card withBorder>
      <Title order={4} mb="sm">
        Banner global de aviso
      </Title>
      {aviso && (
        <Alert color={aviso.ok ? 'green' : 'red'} mb="sm">
          {aviso.texto}
        </Alert>
      )}
      <Stack gap="sm">
        <Switch
          label="Mostrar o banner para todos os usuários"
          checked={ativo}
          onChange={(e) => setAtivo(e.currentTarget.checked)}
        />
        <Select
          label="Nível"
          data={NIVEIS}
          value={nivel}
          onChange={(v) => v && setNivel(v as BannerNivel)}
          allowDeselect={false}
          w={240}
        />
        <Textarea
          label="Mensagem"
          placeholder="Ex.: Manutenção programada hoje às 22h; o sistema pode ficar instável."
          value={mensagem}
          onChange={(e) => setMensagem(e.currentTarget.value)}
          autosize
          minRows={2}
          maxLength={280}
        />
        <Group justify="flex-end">
          <Button
            onClick={salvar}
            loading={salvando}
            disabled={ativo && mensagem.trim().length === 0}
          >
            Salvar banner
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

function TrialCard({ config }: { config: ConfigAdmin }) {
  const [dias, setDias] = useState<number | string>(config.trialDias);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(
    null,
  );

  const n = typeof dias === 'number' ? dias : Number(dias) || 0;

  async function salvar() {
    setSalvando(true);
    setAviso(null);
    try {
      const r = await salvarTrialDias(n);
      setDias(r.dias);
      setAviso({ ok: true, texto: `Trial agora é de ${r.dias} dias.` });
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card withBorder>
      <Title order={4} mb="sm">
        Dias de trial
      </Title>
      {aviso && (
        <Alert color={aviso.ok ? 'green' : 'red'} mb="sm">
          {aviso.texto}
        </Alert>
      )}
      <Text size="sm" c="dimmed" mb="sm">
        Duração do teste grátis de novos cadastros. Só vale para quem se cadastrar
        a partir de agora — trials em andamento não mudam.
      </Text>
      <Group align="flex-end" gap="sm">
        <NumberInput
          label="Dias"
          value={dias}
          onChange={setDias}
          min={1}
          max={90}
          w={120}
        />
        <Button onClick={salvar} loading={salvando} disabled={n < 1 || n > 90}>
          Salvar
        </Button>
      </Group>
    </Card>
  );
}
