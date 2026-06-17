import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  ButtonGroup,
  Heading,
  Inline,
  Label,
  LoadingButton,
  SectionMessage,
  Spinner,
  Stack,
  Strong,
  Text,
  Textfield,
  Toggle,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const AdminSettings = () => {
  // ── URL do Kimai ─────────────────────────────────────────────────────────────
  const [kimaiUrl, setKimaiUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [urlFeedback, setUrlFeedback] = useState(null);

  // ── Mapeamento de atividades ──────────────────────────────────────────────────
  const [mappingEnabled, setMappingEnabled] = useState(false);
  const [extractionPattern, setExtractionPattern] = useState('');
  const [extractionFlags, setExtractionFlags] = useState('');
  const [extractionReplacement, setExtractionReplacement] = useState('');
  const [previewLabel, setPreviewLabel] = useState('');
  const [savingMapping, setSavingMapping] = useState(false);
  const [mappingFeedback, setMappingFeedback] = useState(null);

  // ── Carregamento inicial ──────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      invoke('getAdminConfig'),
      invoke('getMappingConfig'),
    ]).then(([adminConfig, mappingConfig]) => {
      if (adminConfig?.kimaiUrl) setKimaiUrl(adminConfig.kimaiUrl);
      if (mappingConfig) {
        setMappingEnabled(mappingConfig.enabled ?? false);
        setExtractionPattern(mappingConfig.extraction?.pattern ?? '');
        setExtractionFlags(mappingConfig.extraction?.flags ?? '');
        setExtractionReplacement(mappingConfig.extraction?.replacement ?? '');
      }
    }).finally(() => setLoading(false));
  }, []);

  // ── Handlers: URL ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setUrlFeedback(null);
    try {
      await invoke('saveAdminConfig', { kimaiUrl: kimaiUrl.trim() });
      setUrlFeedback({ appearance: 'success', title: 'Configuração salva', body: 'URL do Kimai atualizada com sucesso.' });
    } catch {
      setUrlFeedback({ appearance: 'error', title: 'Erro ao salvar', body: 'Não foi possível salvar a configuração.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setUrlFeedback(null);
    try {
      const result = await invoke('testAdminConnection', { kimaiUrl: kimaiUrl.trim() });
      if (result.success) {
        const versionText = result.version ? ` (v${result.version})` : '';
        setUrlFeedback({ appearance: 'success', title: 'Conexão bem-sucedida', body: `Servidor Kimai localizado${versionText}.` });
      } else {
        setUrlFeedback({ appearance: 'error', title: 'Falha na conexão', body: result.error });
      }
    } catch {
      setUrlFeedback({ appearance: 'error', title: 'Erro', body: 'Não foi possível testar a conexão.' });
    } finally {
      setTesting(false);
    }
  };

  // ── Handlers: mapeamento ──────────────────────────────────────────────────────
  const handleSaveMapping = async () => {
    setSavingMapping(true);
    setMappingFeedback(null);
    try {
      const result = await invoke('saveMappingConfig', {
        enabled: mappingEnabled,
        extraction: {
          pattern: extractionPattern.trim(),
          flags: extractionFlags.trim(),
          replacement: extractionReplacement,
        },
      });
      if (result.success) {
        setMappingFeedback({ appearance: 'success', title: 'Mapeamento salvo', body: 'Configuração de mapeamento atualizada com sucesso.' });
      } else {
        const errorText = Object.values(result.errors ?? {}).join(' ');
        setMappingFeedback({ appearance: 'error', title: 'Erro de validação', body: errorText || 'Verifique os campos e tente novamente.' });
      }
    } catch {
      setMappingFeedback({ appearance: 'error', title: 'Erro ao salvar', body: 'Não foi possível salvar o mapeamento.' });
    } finally {
      setSavingMapping(false);
    }
  };

  // ── Preview live ──────────────────────────────────────────────────────────────
  const previewResult = (() => {
    if (!previewLabel || !mappingEnabled) return '';
    try {
      return previewLabel.replace(new RegExp(extractionPattern, extractionFlags), extractionReplacement);
    } catch {
      return 'Regex inválida';
    }
  })();

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Inline alignBlock="center" space="space.100">
        <Spinner />
        <Text>Carregando configurações...</Text>
      </Inline>
    );
  }

  return (
    <Stack space="space.400">

      {/* ── Seção: URL do Kimai ── */}
      <Stack space="space.200">
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
        {urlFeedback && (
          <SectionMessage appearance={urlFeedback.appearance} title={urlFeedback.title}>
            <Text>{urlFeedback.body}</Text>
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

      {/* ── Seção: Mapeamento de atividades ── */}
      <Stack space="space.200">
        <Heading size="medium">Mapeamento de atividades</Heading>
        <Text>
          Define como o campo <Strong>Categorias</Strong> do card Jira (campo <Strong>labels</Strong> na API) é transformado para
          localizar a atividade correspondente no Kimai. Quando desabilitado, o valor do campo Categorias
          é usado diretamente como texto de busca, sem transformação.
        </Text>

        <Inline alignBlock="center" space="space.100">
          <Toggle
            id="mapping-enabled"
            isChecked={mappingEnabled}
            onChange={(e) => setMappingEnabled(e.target.checked)}
          />
          <Label labelFor="mapping-enabled">Habilitar conversão de código</Label>
        </Inline>

        {mappingEnabled && (
          <Stack space="space.150">
            <Text>
              A expressão regular abaixo é aplicada a cada valor do campo Categorias do card Jira.
              O resultado é o código usado para localizar a atividade no Kimai.
              O nome exibido no painel é sempre o nome cadastrado no Kimai.
            </Text>

            <Inline space="space.100" alignBlock="end">
              <Box>
                <Label labelFor="extraction-pattern">Padrão (regex)</Label>
                <Textfield
                  id="extraction-pattern"
                  name="extractionPattern"
                  placeholder="\D"
                  value={extractionPattern}
                  onChange={(e) => setExtractionPattern(e.target.value)}
                />
              </Box>
              <Box>
                <Label labelFor="extraction-flags">Flags</Label>
                <Textfield
                  id="extraction-flags"
                  name="extractionFlags"
                  placeholder="g"
                  value={extractionFlags}
                  onChange={(e) => setExtractionFlags(e.target.value)}
                />
              </Box>
              <Box>
                <Label labelFor="extraction-replacement">Substituição</Label>
                <Textfield
                  id="extraction-replacement"
                  name="extractionReplacement"
                  placeholder="(vazio = remove os matches)"
                  value={extractionReplacement}
                  onChange={(e) => setExtractionReplacement(e.target.value)}
                />
              </Box>
            </Inline>

            <Stack space="space.100">
              <Label labelFor="preview-label">Pré-visualização</Label>
              <Textfield
                id="preview-label"
                name="previewLabel"
                placeholder="Ex: GPV0339-ME3-E01"
                value={previewLabel}
                onChange={(e) => setPreviewLabel(e.target.value)}
              />
              {previewLabel && (
                <Text>
                  Resultado: <Strong>{previewResult || '(vazio)'}</Strong>
                </Text>
              )}
            </Stack>
          </Stack>
        )}

        {mappingFeedback && (
          <SectionMessage appearance={mappingFeedback.appearance} title={mappingFeedback.title}>
            <Text>{mappingFeedback.body}</Text>
          </SectionMessage>
        )}
        <LoadingButton appearance="primary" isLoading={savingMapping} onClick={handleSaveMapping}>
          Salvar mapeamento
        </LoadingButton>
      </Stack>

    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <AdminSettings />
  </React.StrictMode>
);
