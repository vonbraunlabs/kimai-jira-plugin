import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  ButtonGroup,
  Heading,
  Inline,
  LoadingButton,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  Textfield,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const AdminSettings = () => {
  const [kimaiUrl, setKimaiUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    invoke('getAdminConfig')
      .then((config) => {
        if (config?.kimaiUrl) setKimaiUrl(config.kimaiUrl);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await invoke('saveAdminConfig', { kimaiUrl: kimaiUrl.trim() });
      setFeedback({
        appearance: 'success',
        title: 'Configuração salva',
        body: 'URL do Kimai atualizada com sucesso.',
      });
    } catch {
      setFeedback({
        appearance: 'error',
        title: 'Erro ao salvar',
        body: 'Não foi possível salvar a configuração.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setFeedback(null);
    try {
      const result = await invoke('testAdminConnection', { kimaiUrl: kimaiUrl.trim() });
      if (result.success) {
        const versionText = result.version ? ` (v${result.version})` : '';
        setFeedback({
          appearance: 'success',
          title: 'Conexão bem-sucedida',
          body: `Servidor Kimai localizado${versionText}.`,
        });
      } else {
        setFeedback({
          appearance: 'error',
          title: 'Falha na conexão',
          body: result.error,
        });
      }
    } catch {
      setFeedback({
        appearance: 'error',
        title: 'Erro',
        body: 'Não foi possível testar a conexão.',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Inline alignBlock="center" space="space.100">
        <Spinner />
        <Text>Carregando configurações...</Text>
      </Inline>
    );
  }

  return (
    <Stack space="space.300">
      <Heading size="medium">Configurações do Kimai</Heading>
      <Text>
        Configure a URL base da instância Kimai da organização. Todos os usuários usarão este endereço para registrar apontamentos de horas.
      </Text>
      <Textfield
        name="kimaiUrl"
        label="URL do Kimai"
        placeholder="https://kimai.suaempresa.com"
        value={kimaiUrl}
        onChange={(e) => setKimaiUrl(e.target.value)}
      />
      {feedback && (
        <SectionMessage appearance={feedback.appearance} title={feedback.title}>
          <Text>{feedback.body}</Text>
        </SectionMessage>
      )}
      <ButtonGroup>
        <LoadingButton appearance="primary" isLoading={saving} onClick={handleSave}>
          Salvar
        </LoadingButton>
        <LoadingButton isLoading={testing} onClick={handleTest}>
          Testar conexão
        </LoadingButton>
      </ButtonGroup>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <AdminSettings />
  </React.StrictMode>
);
