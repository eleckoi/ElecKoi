import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MobileModelConfigDetail } from '../../src/mobile/MobileModelConfigDetail.jsx';
import { MobileChatModelPicker } from '../../src/mobile/MobileChatModelPicker.jsx';
import { catalogItem } from '../../src/modules/models/model/modelProviderCatalog.js';
import { modelParameterState } from '../../src/modules/models/model/modelConfigDraft.js';
import { useModelCapabilities } from '../../src/modules/models/hooks/useModelCapabilities.js';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/base.css';
import '../../src/mobile/mobile.css';
import '../../src/modules/models/styles/model-config.css';
import '../../src/modules/models/styles/model-picker.css';

const initial = { id: 'synthetic-config', name: '合成配置', provider: 'custom', api_format: 'responses', base_url: '', api_key: '',
  model: 'synthetic-model', model_options: [{ id: 'synthetic-model', isUserAdded: true, inputModalities: ['text', 'image'], supportsImageInput: true,
    reasoningEfforts: { low: 'low', high: 'high' } }], custom_headers: {} };
function Fixture() {
  const [mode, setMode] = useState('editor');
  const [form, setForm] = useState(initial);
  const [modelMenuOpen, setModelMenuOpen] = useState(false), [manualModelOpen, setManualModelOpen] = useState(false);
  const modelPickerRef = useRef(null), manualModelRef = useRef(null);
  const modelCapabilities = useModelCapabilities(form);
  const parameterState = modelParameterState(form, form.provider);
  const updateOption = patch => setForm(current => ({ ...current, model_options: current.model_options.map(option => option.id === current.model ? { ...option, ...patch } : option) }));
  const parameterEditor = { form, ...parameterState, modelCapabilities, onUpdateModelOption: updateOption };
  const basicEditor = { form, activeProvider: catalogItem('custom'), isImageProvider: false, isPersisted: true, providerIdError: false,
    onDelete: () => {}, modelPickerRef, manualModelRef, modelMenuOpen, modelItems: [], removableModelIds: new Set(),
    updateField: (key, value) => setForm(current => ({ ...current, [key]: value })), loadingModels: false, fetchModels: () => {},
    manualModelOpen, manualModelName: '', setManualModelOpen, setModelMenuOpen };
  const networkEditor = { form, draftHeader: { name: '', value: '' }, setDraftHeader: () => {}, onUpdateField: basicEditor.updateField };
  document.documentElement.dataset.eleckoiMobile = 'true';
  return <MainPageContext.Provider value={{ registerBackHandler: () => () => {} }}>
    <nav><button data-mode="editor" onClick={() => setMode('editor')}>配置页</button><button data-mode="picker" onClick={() => setMode('picker')}>选择模型</button></nav>
    <main data-mode={mode} style={{ height: 'calc(100vh - 48px)' }}>
      {mode === 'editor' ? <div className="mobile-shell"><div className="mobile-model-editor mobile-root-page">
        <MobileModelConfigDetail activeProvider={catalogItem('custom')} isImageProvider={false} basicEditor={basicEditor} parameterEditor={parameterEditor} networkEditor={networkEditor} />
      </div></div> : <MobileChatModelPicker title="选择模型" configs={[form]} selectedConfig={form} selectedModelId={form.model}
        tab="parameters" setTab={() => {}} saving={false} hasChanges={false} canEditParameters parameterForm={form} parameterState={parameterState}
        modelCapabilities={modelCapabilities} onParameters={updateOption} onSave={() => {}} onClose={() => setMode('editor')} />}
    </main>
  </MainPageContext.Provider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
