import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  ButtonGroup,
  DatePicker,
  DynamicTable,
  Heading,
  Inline,
  Label,
  LoadingButton,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  Textfield,
  TimePicker,
  useProductContext,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import {
  addJiraWorklog,
  autoDetectActivity,
  autoDetectProject,
  fetchIssueContext,
  formatDuration,
  formatKimaiDuration,
} from './jira';

// ─── Utilities ────────────────────────────────────────────────────────────────

const todayISO = () => new Date().toISOString().slice(0, 10);

const nowHHMM = (offsetMinutes = 0) => {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const toKimaiDatetime = (date, time) => `${date}T${time}:00`;

const toOption = (item) => ({ label: item.name, value: item.id });

const toActivityOption = (item) => ({ label: item.name, value: item.id });

const isAuthError = (e) => e?.message?.includes('[AUTH_INVALID]');

// ─── ProjectActivitySelects ───────────────────────────────────────────────────
// Reusable pair of selects that reloads activities when the project changes.
// Calls onProjectChange/onActivityChange on mount with the initial values so
// the parent form's state is always in sync with what's displayed.

const ProjectActivitySelects = ({
  projects,
  initialProject,
  initialActivity,
  onProjectChange,
  onActivityChange,
}) => {
  const [selectedProject, setSelectedProject] = useState(
    initialProject ? toOption(initialProject) : null,
  );
  const [selectedActivity, setSelectedActivity] = useState(
    initialActivity ? toActivityOption(initialActivity) : null,
  );
  const [activities, setActivities] = useState([]);
  const [loadingActs, setLoadingActs] = useState(false);

  // Load activities whenever the selected project changes (including on mount
  // when an initial project is provided).
  useEffect(() => {
    if (!selectedProject) {
      setActivities([]);
      setSelectedActivity(null);
      onActivityChange(null);
      return;
    }
    setLoadingActs(true);
    invoke('getKimaiActivities', { projectId: selectedProject.value })
      .then((list) => {
        const acts = list ?? [];
        setActivities(acts);
        // Keep the selected activity only if it still belongs to the new project.
        const still = acts.find((a) => a.id === selectedActivity?.value);
        if (!still) {
          setSelectedActivity(null);
          onActivityChange(null);
        }
      })
      .finally(() => setLoadingActs(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.value]);

  const handleProjectChange = (opt) => {
    setSelectedProject(opt);
    const proj = projects.find((p) => p.id === opt?.value) ?? null;
    onProjectChange(proj);
  };

  const handleActivityChange = (opt) => {
    // Re-map to toActivityOption to keep label consistent with the dropdown
    const act = activities.find((a) => a.id === opt?.value) ?? null;
    setSelectedActivity(act ? toActivityOption(act) : null);
    onActivityChange(act);
  };

  return (
    <Stack space="space.100">
      <Label labelFor="sel-project">Projeto</Label>
      <Select
        inputId="sel-project"
        options={projects.map(toOption)}
        value={selectedProject}
        onChange={handleProjectChange}
        placeholder="Selecione o projeto"
      />
      <Label labelFor="sel-activity">Atividade</Label>
      {loadingActs ? (
        <Inline space="space.100" alignBlock="center">
          <Spinner size="small" />
          <Text>Carregando atividades...</Text>
        </Inline>
      ) : (
        <Select
          inputId="sel-activity"
          options={activities.map(toActivityOption)}
          value={selectedActivity}
          onChange={handleActivityChange}
          placeholder={
            selectedProject ? 'Selecione a atividade' : 'Selecione um projeto primeiro'
          }
          isDisabled={!selectedProject}
        />
      )}
    </Stack>
  );
};

// ─── ApiKeySetup ──────────────────────────────────────────────────────────────

const ApiKeySetup = ({ onSaved, isInvalid = false }) => {
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    const result = await invoke('saveUserApiKey', { apiKey: apiKey.trim() });
    setSaving(false);
    if (result.success) {
      onSaved();
    } else {
      setError(result.error ?? 'Erro ao salvar a API Key.');
    }
  };

  return (
    <Stack space="space.200">
      {isInvalid && (
        <SectionMessage appearance="warning" title="API Key inválida ou expirada">
          <Text>Sua API Key do Kimai não é mais válida. Insira uma nova chave para continuar.</Text>
        </SectionMessage>
      )}
      <Heading size="small">
        {isInvalid ? 'Atualizar API Key do Kimai' : 'Configure sua API Key do Kimai'}
      </Heading>
      {!isInvalid && <Text>Para registrar horas, insira sua chave de API pessoal do Kimai.</Text>}
      <Text>Como obter: no Kimai, acesse seu Perfil → API → Gerar token.</Text>
      <Label labelFor="api-key-input">API Key</Label>
      <Textfield
        id="api-key-input"
        name="apiKey"
        type="password"
        placeholder="Cole sua API Key aqui"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
      />
      {error && (
        <SectionMessage appearance="error" title="Erro">
          <Text>{error}</Text>
        </SectionMessage>
      )}
      <LoadingButton appearance="primary" isLoading={saving} onClick={handleSave}>
        Salvar e conectar
      </LoadingButton>
    </Stack>
  );
};

// ─── TimerStartModal ──────────────────────────────────────────────────────────

const TimerStartModal = ({
  projects,
  initialProject,
  initialActivity,
  defaultDescription,
  issueKey,
  onStart,
  onClose,
}) => {
  // Initialize project/activity from auto-detected values so the form is ready
  // to submit immediately without requiring re-selection.
  const [project, setProject] = useState(initialProject ?? null);
  const [activity, setActivity] = useState(initialActivity ?? null);
  const [description, setDescription] = useState(defaultDescription ?? '');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);

  const handleStart = async () => {
    if (!project || !activity) return;
    setStarting(true);
    setStartError(null);
    try {
      await onStart({
        projectId: project.id,
        activityId: activity.id,
        description,
        issueKey,
      });
    } catch (e) {
      setStartError(e.message ?? 'Erro ao iniciar o timer.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <ModalTransition>
      <Modal onClose={onClose} width="medium">
        <ModalHeader>
          <ModalTitle>Iniciar timer</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Stack space="space.150">
            <ProjectActivitySelects
              projects={projects}
              initialProject={initialProject}
              initialActivity={initialActivity}
              onProjectChange={setProject}
              onActivityChange={setActivity}
            />
            <Label labelFor="timer-desc">Descrição (opcional)</Label>
            <Textfield
              id="timer-desc"
              name="timerDescription"
              placeholder="No que você está trabalhando?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Stack space="space.100">
            {startError && (
              <SectionMessage appearance="error" title="Erro ao iniciar">
                <Text>{startError}</Text>
              </SectionMessage>
            )}
            <ButtonGroup>
              <Button appearance="subtle" onClick={onClose}>
                Cancelar
              </Button>
              <LoadingButton
                appearance="primary"
                isLoading={starting}
                isDisabled={!project || !activity}
                onClick={handleStart}
              >
                Iniciar
              </LoadingButton>
            </ButtonGroup>
          </Stack>
        </ModalFooter>
      </Modal>
    </ModalTransition>
  );
};

// ─── ManualEntryForm ──────────────────────────────────────────────────────────

const ManualEntryForm = ({
  projects,
  initialProject,
  initialActivity,
  defaultDescription,
  issueKey,
  onAdd,
}) => {
  const [date, setDate] = useState(todayISO());
  const [startTime, setStartTime] = useState(nowHHMM());
  const [endTime, setEndTime] = useState(nowHHMM(60));
  // Initialize from auto-detected values
  const [project, setProject] = useState(initialProject ?? null);
  const [activity, setActivity] = useState(initialActivity ?? null);
  const [description, setDescription] = useState(defaultDescription ?? '');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  const canAdd = project && activity && date && startTime && endTime;

  const handleAdd = async () => {
    setAdding(true);
    setError(null);
    try {
      await onAdd({
        projectId: project.id,
        activityId: activity.id,
        description,
        begin: toKimaiDatetime(date, startTime),
        end: toKimaiDatetime(date, endTime),
        issueKey,
      });
      setDescription(defaultDescription ?? '');
    } catch (e) {
      setError(e.message ?? 'Erro ao adicionar apontamento.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="end">
        <Stack space="space.050">
          <Label labelFor="man-date">Data</Label>
          <DatePicker id="man-date" value={date} onChange={(v) => setDate(v)} />
        </Stack>
        <Stack space="space.050">
          <Label labelFor="man-start">Início</Label>
          <TimePicker id="man-start" value={startTime} onChange={(v) => setStartTime(v)} />
        </Stack>
        <Stack space="space.050">
          <Label labelFor="man-end">Fim</Label>
          <TimePicker id="man-end" value={endTime} onChange={(v) => setEndTime(v)} />
        </Stack>
      </Inline>
      <ProjectActivitySelects
        projects={projects}
        initialProject={initialProject}
        initialActivity={initialActivity}
        onProjectChange={setProject}
        onActivityChange={setActivity}
      />
      <Label labelFor="man-desc">Descrição</Label>
      <Textfield
        id="man-desc"
        name="manualDescription"
        placeholder="Descrição do apontamento"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {error && (
        <SectionMessage appearance="error" title="Erro">
          <Text>{error}</Text>
        </SectionMessage>
      )}
      <LoadingButton
        appearance="primary"
        isLoading={adding}
        isDisabled={!canAdd}
        onClick={handleAdd}
      >
        Adicionar
      </LoadingButton>
    </Stack>
  );
};

// ─── TimesheetHistory ─────────────────────────────────────────────────────────

const TimesheetHistory = ({ timesheets, onDelete }) => {
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (id) => {
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
  };

  const formatBegin = (iso) =>
    new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  if (!timesheets.length) {
    return <Text>Nenhum apontamento registrado para este issue.</Text>;
  }

  return (
    <DynamicTable
      head={{
        cells: [
          { key: 'begin', content: 'Horário' },
          { key: 'duration', content: 'Duração' },
          { key: 'context', content: 'Projeto / Atividade' },
          { key: 'desc', content: 'Descrição' },
          { key: 'actions', content: '' },
        ],
      }}
      rows={timesheets.map((ts) => ({
        key: String(ts.id),
        cells: [
          { key: 'begin', content: <Text>{formatBegin(ts.begin)}</Text> },
          { key: 'duration', content: <Text>{formatKimaiDuration(ts.duration)}</Text> },
          {
            key: 'context',
            content: (
              <Text>
                {ts.project?.name ?? ts.project} / {ts.activity?.name ?? String(ts.activity ?? '')}
              </Text>
            ),
          },
          { key: 'desc', content: <Text>{ts.description || '—'}</Text> },
          {
            key: 'actions',
            content: (
              <LoadingButton
                appearance="subtle"
                isLoading={deletingId === ts.id}
                onClick={() => handleDelete(ts.id)}
              >
                Excluir
              </LoadingButton>
            ),
          },
        ],
      }))}
    />
  );
};

// ─── App ──────────────────────────────────────────────────────────────────────

const App = () => {
  const context = useProductContext();
  // Forge UI Kit 2 exposes the issue key at extension.issue.key;
  // platformContext.issueKey is the legacy path — try both.
  const issueKey =
    context?.extension?.issue?.key ?? context?.platformContext?.issueKey ?? null;

  // 'loading' | 'no-url' | 'setup-key' | 'main' | 'error'
  const [view, setView] = useState('loading');
  const [initKey, setInitKey] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);

  const [projects, setProjects] = useState([]);
  const [autoProject, setAutoProject] = useState(null);
  const [autoActivity, setAutoActivity] = useState(null);
  const [issueSummary, setIssueSummary] = useState('');
  const [mappingConfig, setMappingConfig] = useState(null);
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [timesheets, setTimesheets] = useState([]);

  const [showTimerModal, setShowTimerModal] = useState(false);
  const [stoppingTimer, setStoppingTimer] = useState(false);

  // ── Initialization ───────────────────────────────────────────────────────────

  useEffect(() => {
    setView('loading');

    const init = async () => {
      try {
        // getContext doesn't need issueKey — check config first so the right
        // fallback renders even before useProductContext delivers a key.
        const ctx = await invoke('getContext');

        if (!ctx.kimaiUrlConfigured) { setView('no-url'); return; }
        if (!ctx.apiKeyConfigured) { setView('setup-key'); return; }

        // Config OK but issueKey not yet available — stay loading;
        // the effect re-runs when useProductContext delivers the key.
        if (!issueKey) return;

        const [issue, projectsList, activeTimerData, tsList, mappingConfigData] = await Promise.all([
          fetchIssueContext(issueKey),
          invoke('getKimaiProjects'),
          invoke('getActiveTimer'),
          invoke('getIssueTimesheets', { issueKey }),
          invoke('getMappingConfig'),
        ]);

        const pList = projectsList ?? [];
        setProjects(pList);
        setActiveTimer(activeTimerData);
        setTimesheets(tsList ?? []);
        setIssueSummary(issue.summary ?? '');
        setMappingConfig(mappingConfigData ?? null);

        const detectedProject = autoDetectProject(pList, issue.projectName);
        setAutoProject(detectedProject);

        const actList = await invoke(
          'getKimaiActivities',
          detectedProject ? { projectId: detectedProject.id } : undefined,
        );
        const detectedActivity = autoDetectActivity(actList ?? [], issue.epicName, issue.labels, mappingConfigData);
        setAutoActivity(detectedActivity);

        setView('main');
      } catch (e) {
        if (isAuthError(e)) {
          setView('invalid-key');
        } else {
          setErrorMsg(e.message ?? 'Erro ao inicializar o painel.');
          setView('error');
        }
      }
    };

    init();
  }, [issueKey, initKey]);

  // ── Live timer counter ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!activeTimer) { setElapsed(0); return; }
    const startMs = new Date(activeTimer.begin).getTime();
    // Guard against invalid/missing begin timestamp
    if (isNaN(startMs)) {
      console.warn('[App] activeTimer.begin is invalid, clearing timer:', activeTimer.begin);
      setActiveTimer(null);
      setElapsed(0);
      return;
    }
    setElapsed(Date.now() - startMs);
    const id = setInterval(() => setElapsed(Date.now() - startMs), 1000);
    return () => clearInterval(id);
  }, [activeTimer]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleTimerStart = async (payload) => {
    try {
      const entry = await invoke('startTimer', payload);
      setActiveTimer(entry);
      setShowTimerModal(false);
      const tList = await invoke('getIssueTimesheets', { issueKey });
      setTimesheets(tList ?? []);
    } catch (e) {
      if (isAuthError(e)) {
        setShowTimerModal(false);
        setView('invalid-key');
        return;
      }
      throw e;
    }
  };

  const handleTimerStop = async () => {
    setStoppingTimer(true);
    try {
      await invoke('stopTimer', { timesheetId: activeTimer.id });
      await addJiraWorklog(
        issueKey,
        Math.round(elapsed / 1000),
        activeTimer.begin,
        activeTimer.description,
      );
      setActiveTimer(null);
      const tList = await invoke('getIssueTimesheets', { issueKey });
      setTimesheets(tList ?? []);
    } catch (e) {
      if (isAuthError(e)) {
        setView('invalid-key');
      } else {
        throw e;
      }
    } finally {
      setStoppingTimer(false);
    }
  };

  const handleManualAdd = useCallback(
    async (payload) => {
      try {
        await invoke('createManualEntry', payload);
        const seconds = (new Date(payload.end) - new Date(payload.begin)) / 1000;
        await addJiraWorklog(issueKey, seconds, payload.begin, payload.description);
        const tList = await invoke('getIssueTimesheets', { issueKey });
        setTimesheets(tList ?? []);
      } catch (e) {
        if (isAuthError(e)) {
          setView('invalid-key');
          return;
        }
        throw e;
      }
    },
    [issueKey],
  );

  const handleDelete = useCallback(async (timesheetId) => {
    try {
      await invoke('deleteEntry', { timesheetId });
      setTimesheets((prev) => prev.filter((ts) => ts.id !== timesheetId));
    } catch (e) {
      if (isAuthError(e)) {
        setView('invalid-key');
        return;
      }
      throw e;
    }
  }, []);

  const handleApiKeySaved = () => setInitKey((k) => k + 1);

  // ── Render: non-main states ──────────────────────────────────────────────────

  if (view === 'loading') {
    return (
      <Inline alignBlock="center" space="space.100">
        <Spinner />
        <Text>Carregando...</Text>
      </Inline>
    );
  }

  if (view === 'no-url') {
    return (
      <SectionMessage appearance="warning" title="Configuração pendente">
        <Text>
          O administrador ainda não configurou a URL do Kimai. Acesse as configurações do
          plugin em Configurações do Jira → Apps para completar a configuração.
        </Text>
      </SectionMessage>
    );
  }

  if (view === 'setup-key') {
    return <ApiKeySetup onSaved={handleApiKeySaved} />;
  }

  if (view === 'invalid-key') {
    return <ApiKeySetup onSaved={handleApiKeySaved} isInvalid />;
  }

  if (view === 'error') {
    return (
      <SectionMessage appearance="error" title="Erro ao carregar">
        <Text>{errorMsg}</Text>
        <Button appearance="link" onClick={() => setInitKey((k) => k + 1)}>
          Tentar novamente
        </Button>
      </SectionMessage>
    );
  }

  // ── Render: main panel ───────────────────────────────────────────────────────

  const timerSection = activeTimer ? (
    <Stack space="space.150">
      <Heading size="xlarge">{formatDuration(elapsed)}</Heading>
      <Stack space="space.050">
        <Text>{activeTimer.project?.name ?? ''}</Text>
        <Text>{activeTimer.activity?.name ?? ''}</Text>
        {activeTimer.description ? <Text>{activeTimer.description}</Text> : null}
      </Stack>
      <LoadingButton
        appearance="danger"
        isLoading={stoppingTimer}
        onClick={handleTimerStop}
      >
        Parar timer
      </LoadingButton>
    </Stack>
  ) : (
    <Button appearance="primary" onClick={() => setShowTimerModal(true)}>
      Iniciar timer
    </Button>
  );

  return (
    <Stack space="space.300">

      <Tabs id="kimai-tabs">
        <TabList>
          <Tab>Timer</Tab>
          <Tab>Apontamento manual</Tab>
        </TabList>

        <TabPanel>
          <Box paddingBlockStart="space.200">
            {timerSection}
          </Box>
        </TabPanel>

        <TabPanel>
          <Box paddingBlockStart="space.200">
            <ManualEntryForm
              projects={projects}
              initialProject={autoProject}
              initialActivity={autoActivity}
              defaultDescription={issueSummary}
              issueKey={issueKey}
              onAdd={handleManualAdd}
            />
          </Box>
        </TabPanel>
      </Tabs>

      {/* History shown below tabs, always visible */}
      <Stack space="space.100">
        <Heading size="small">Histórico do issue</Heading>
        <TimesheetHistory timesheets={timesheets} onDelete={handleDelete} />
      </Stack>

      <Button appearance="subtle" onClick={() => setView('invalid-key')}>
        Trocar API Key
      </Button>

      {showTimerModal && (
        <TimerStartModal
          projects={projects}
          initialProject={autoProject}
          initialActivity={autoActivity}
          defaultDescription={issueSummary}
          issueKey={issueKey}
          onStart={handleTimerStart}
          onClose={() => setShowTimerModal(false)}
        />
      )}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
