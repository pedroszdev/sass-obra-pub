import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { type FormEvent, useEffect, useState } from 'react';
import { addAtestado, ApiError, updateAtestado } from '../lib/api';
import type { Atestado, AtestadoInput } from '../types/company-profile';

interface Props {
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
  atestado?: Atestado | null;
}

type NumValue = number | string;
const toNum = (v: NumValue): number | null =>
  typeof v === 'number' ? v : v.trim() === '' ? null : Number(v);
const orNull = (s: string): string | null => (s.trim() ? s.trim() : null);

export function AtestadoFormModal({ opened, onClose, onSaved, atestado }: Props) {
  const editing = Boolean(atestado);
  const [descricao, setDescricao] = useState('');
  const [quantitativo, setQuantitativo] = useState<NumValue>('');
  const [unidade, setUnidade] = useState('');
  const [valor, setValor] = useState<NumValue>('');
  const [contratante, setContratante] = useState('');
  const [ano, setAno] = useState<NumValue>('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setDescricao(atestado?.descricao ?? '');
    setQuantitativo(atestado?.quantitativo ?? '');
    setUnidade(atestado?.unidade ?? '');
    setValor(atestado?.valor ?? '');
    setContratante(atestado?.contratante ?? '');
    setAno(atestado?.ano ?? '');
    setError(null);
    setSaving(false);
  }, [opened, atestado]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!descricao.trim()) {
      setError('Descreva o objeto/tipo de obra do atestado.');
      return;
    }
    const payload: AtestadoInput = {
      descricao: descricao.trim(),
      quantitativo: toNum(quantitativo),
      unidade: orNull(unidade),
      valor: toNum(valor),
      contratante: orNull(contratante),
      ano: toNum(ano),
    };
    setSaving(true);
    setError(null);
    try {
      if (atestado) {
        await updateAtestado(atestado.id, payload);
      } else {
        await addAtestado(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status !== 0
          ? err.message
          : 'Não foi possível salvar. Verifique a conexão e tente novamente.',
      );
      setSaving(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? 'Editar atestado' : 'Adicionar atestado'}
      centered
      radius="md"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          <Textarea
            label="Objeto / tipo de obra"
            placeholder="Ex.: Pavimentação asfáltica de vias urbanas"
            value={descricao}
            onChange={(e) => setDescricao(e.currentTarget.value)}
            autosize
            minRows={2}
            required
          />
          <Group grow>
            <NumberInput
              label="Quantitativo"
              placeholder="Ex.: 1200"
              value={quantitativo}
              onChange={setQuantitativo}
              min={0}
              thousandSeparator="."
              decimalSeparator=","
            />
            <TextInput
              label="Unidade"
              placeholder="m², m, un."
              value={unidade}
              onChange={(e) => setUnidade(e.currentTarget.value)}
            />
          </Group>
          <Group grow>
            <NumberInput
              label="Valor do contrato (R$)"
              placeholder="Ex.: 480000"
              value={valor}
              onChange={setValor}
              min={0}
              thousandSeparator="."
              decimalSeparator=","
              prefix="R$ "
            />
            <NumberInput
              label="Ano"
              placeholder="Ex.: 2024"
              value={ano}
              onChange={setAno}
              min={1900}
              max={2100}
              allowDecimal={false}
            />
          </Group>
          <TextInput
            label="Contratante"
            placeholder="Ex.: Município de Florianópolis (opcional)"
            value={contratante}
            onChange={(e) => setContratante(e.currentTarget.value)}
          />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" color="orange" loading={saving}>
              {editing ? 'Salvar' : 'Adicionar'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
