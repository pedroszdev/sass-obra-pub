import {
  ActionIcon,
  Alert,
  Button,
  FileButton,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPaperclip, IconX } from '@tabler/icons-react';
import { type FormEvent, useEffect, useState } from 'react';
import {
  addCertidao,
  ApiError,
  updateCertidao,
  uploadCertidaoArquivo,
} from '../lib/api';
import { CERTIDAO_TIPO_OPTIONS, formatBytes } from '../lib/certidao';
import type { Certidao, CertidaoInput, CertidaoTipo } from '../types/company-profile';

const ACCEPT = 'application/pdf,image/jpeg,image/png';

interface Props {
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Certidão em edição; ausente/null = criação. */
  certidao?: Certidao | null;
}

// '' (campo vazio) vira null para limpar no backend; datas vazias não podem ir
// como '' (falham no @IsDateString) — null é o correto.
const orNull = (s: string): string | null => (s.trim() ? s.trim() : null);

export function CertidaoFormModal({ opened, onClose, onSaved, certidao }: Props) {
  const editing = Boolean(certidao);
  const [tipo, setTipo] = useState<CertidaoTipo | null>(null);
  const [descricao, setDescricao] = useState('');
  const [numero, setNumero] = useState('');
  const [orgaoEmissor, setOrgaoEmissor] = useState('');
  const [dataEmissao, setDataEmissao] = useState('');
  const [dataValidade, setDataValidade] = useState('');
  // Arquivo escolhido no modal (anexado após criar/salvar). null = nenhum novo.
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Sincroniza o formulário ao abrir (com os dados da certidão, se editando).
  useEffect(() => {
    if (!opened) return;
    setTipo(certidao?.tipo ?? null);
    setDescricao(certidao?.descricao ?? '');
    setNumero(certidao?.numero ?? '');
    setOrgaoEmissor(certidao?.orgaoEmissor ?? '');
    setDataEmissao(certidao?.dataEmissao?.slice(0, 10) ?? '');
    setDataValidade(certidao?.dataValidade?.slice(0, 10) ?? '');
    setArquivo(null);
    setError(null);
    setSaving(false);
  }, [opened, certidao]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!tipo) {
      setError('Selecione o tipo da certidão.');
      return;
    }
    if (tipo === 'OUTRA' && !descricao.trim()) {
      setError('Para o tipo "Outra", descreva qual é a certidão.');
      return;
    }
    const payload: CertidaoInput = {
      tipo,
      descricao: orNull(descricao),
      numero: orNull(numero),
      orgaoEmissor: orNull(orgaoEmissor),
      dataEmissao: orNull(dataEmissao),
      dataValidade: orNull(dataValidade),
    };
    setSaving(true);
    setError(null);
    try {
      // Cria/atualiza a certidão e, se houver arquivo escolhido, anexa em
      // seguida (o upload precisa do id — por isso vem depois do create).
      const salva = certidao
        ? await updateCertidao(certidao.id, payload)
        : await addCertidao(payload);
      if (arquivo) {
        await uploadCertidaoArquivo(salva.id, arquivo);
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
      title={editing ? 'Editar certidão' : 'Adicionar certidão'}
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
          <Select
            label="Tipo"
            placeholder="Selecione o tipo"
            data={CERTIDAO_TIPO_OPTIONS}
            value={tipo}
            onChange={(v) => setTipo(v as CertidaoTipo | null)}
            required
            allowDeselect={false}
            searchable
          />
          {tipo === 'OUTRA' && (
            <TextInput
              label="Qual certidão?"
              placeholder="Descreva a certidão"
              value={descricao}
              onChange={(e) => setDescricao(e.currentTarget.value)}
              required
            />
          )}
          <TextInput
            label="Número"
            placeholder="Número da certidão (opcional)"
            value={numero}
            onChange={(e) => setNumero(e.currentTarget.value)}
          />
          <TextInput
            label="Órgão emissor"
            placeholder="Ex.: RFB, CEF, TST (opcional)"
            value={orgaoEmissor}
            onChange={(e) => setOrgaoEmissor(e.currentTarget.value)}
          />
          <Group grow>
            <TextInput
              label="Emissão"
              type="date"
              value={dataEmissao}
              onChange={(e) => setDataEmissao(e.currentTarget.value)}
            />
            <TextInput
              label="Validade"
              type="date"
              value={dataValidade}
              onChange={(e) => setDataValidade(e.currentTarget.value)}
            />
          </Group>
          <Stack gap={4}>
            <Text fz={13} fw={500} c="gray.7">
              Arquivo (PDF ou imagem)
            </Text>
            {arquivo ? (
              // Arquivo recém-escolhido: some ao anexar no submit.
              <Group gap={8} wrap="nowrap">
                <IconPaperclip size={14} color="var(--mantine-color-aco-6)" style={{ flex: 'none' }} />
                <Text fz={13} lineClamp={1} style={{ flex: 1 }}>
                  {arquivo.name} ({formatBytes(arquivo.size)})
                </Text>
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setArquivo(null)} aria-label="Remover arquivo escolhido">
                  <IconX size={14} />
                </ActionIcon>
              </Group>
            ) : (
              <Group gap="sm" wrap="nowrap">
                <FileButton onChange={setArquivo} accept={ACCEPT}>
                  {(props) => (
                    <Button {...props} variant="light" color="orange" size="xs" leftSection={<IconPaperclip size={14} />}>
                      {certidao?.arquivo ? 'Substituir arquivo' : 'Anexar arquivo'}
                    </Button>
                  )}
                </FileButton>
                {certidao?.arquivo && (
                  <Text fz={12} c="dimmed" lineClamp={1}>
                    Atual: {certidao.arquivo.nomeArquivo}
                  </Text>
                )}
              </Group>
            )}
          </Stack>
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
