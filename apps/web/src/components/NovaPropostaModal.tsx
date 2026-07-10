import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createProposta, getFavoritos } from '../lib/api';
import type { EditalListItem } from '../types/edital';

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Chamado após criar — a página recarrega a lista. */
  onCreated: () => void;
}

const truncate = (s: string, max = 90): string =>
  s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;

// Cria uma proposta a partir de um edital salvo (favorito). O título é
// pré-preenchido com o objeto do edital e pode ser ajustado.
export function NovaPropostaModal({ opened, onClose, onCreated }: Props) {
  const navigate = useNavigate();
  const [favoritos, setFavoritos] = useState<EditalListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editalId, setEditalId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Carrega os editais salvos ao abrir; reseta o formulário.
  useEffect(() => {
    if (!opened) return;
    setEditalId(null);
    setTitulo('');
    setError(null);
    setSaving(false);
    setLoadError(null);
    setFavoritos(null);
    const controller = new AbortController();
    getFavoritos()
      .then((res) => setFavoritos(res.data))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : 'Não foi possível carregar seus editais salvos.',
        );
      });
    return () => controller.abort();
  }, [opened]);

  // Ao escolher o edital, sugere o título a partir do objeto.
  function handleSelectEdital(value: string | null) {
    setEditalId(value);
    const edital = favoritos?.find((e) => e.id === value);
    if (edital) setTitulo(truncate(edital.objeto, 120));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!editalId) {
      setError('Selecione o edital de origem.');
      return;
    }
    if (!titulo.trim()) {
      setError('Dê um título para o orçamento.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Leva direto ao editor da proposta recém-criada — criar e continuar na
      // lista obrigava o usuário a caçar o que ele acabou de criar.
      const proposta = await createProposta({ editalId, titulo: titulo.trim() });
      onCreated();
      onClose();
      navigate(`/orcamentos/${proposta.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status !== 0
          ? err.message
          : 'Não foi possível criar. Verifique a conexão e tente novamente.',
      );
      setSaving(false);
    }
  }

  const semFavoritos = favoritos !== null && favoritos.length === 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Novo orçamento"
      centered
      radius="md"
    >
      {loadError ? (
        <Alert color="red" variant="light">
          {loadError}
        </Alert>
      ) : semFavoritos ? (
        <Stack gap="sm">
          <Text fz={14} c="dimmed">
            Você ainda não salvou nenhum edital. Salve a obra que quer orçar e
            ela aparecerá aqui.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Fechar
            </Button>
            <Button color="orange" onClick={() => navigate('/editais')}>
              Buscar editais
            </Button>
          </Group>
        </Stack>
      ) : (
        <form onSubmit={handleSubmit}>
          <Stack gap="sm">
            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}
            <Select
              label="Edital de origem"
              placeholder={favoritos ? 'Selecione um edital salvo' : 'Carregando…'}
              data={(favoritos ?? []).map((e) => ({
                value: e.id,
                label: `${truncate(e.objeto)} — ${e.municipioNome}/${e.uf}`,
              }))}
              value={editalId}
              onChange={handleSelectEdital}
              disabled={!favoritos}
              required
              searchable
            />
            <TextInput
              label="Título do orçamento"
              placeholder="Ex.: Pavimentação — bairro Centro"
              value={titulo}
              onChange={(e) => setTitulo(e.currentTarget.value)}
              required
            />
            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" color="orange" loading={saving}>
                Criar orçamento
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
