import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MobileModelConfigDetail } from '../../src/mobile/MobileModelConfigDetail.jsx';
import { MobilePresetLibraryBar } from '../../src/mobile/MobilePresetLibraryBar.jsx';
import '../../src/mobile/mobile-preset-library.css';
import { PresetIntroductionEditor } from '../../src/modules/presets/components/PresetIntroductionEditor.jsx';
import { Checkbox, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import { catalogItem } from '../../src/modules/models/model/modelProviderCatalog.js';
import { modelParameterState } from '../../src/modules/models/model/modelConfigDraft.js';
import { useModelCapabilities } from '../../src/modules/models/hooks/useModelCapabilities.js';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/base.css';
import '../../src/mobile/mobile.css';
import '../../src/mobile/mobile-models.css';
import '../../src/modules/models/styles/model-config.css';
import '../../src/modules/models/styles/model-menu.css';
import '../../src/mobile/mobile-preset-editor.css';

const initial = { id: 'synthetic-config', name: '合成配置', provider: 'custom', builtin: true, useBuiltinModels: true, api_format: 'responses', base_url: '', api_key: '',
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
    <aside style={{ position: 'absolute', left: -1000 }}><Checkbox className="reference-checkbox" label="官方对照" checked onChange={() => {}} /><Switch className="reference-switch" label="官方开关对照" checked onChange={() => {}} /></aside>
    <nav><button data-mode="editor" onClick={() => setMode('editor')}>配置页</button><button data-mode="groups" onClick={() => setMode('groups')}>分组管理</button><button data-mode="updates" onClick={() => setMode('updates')}>更新记录</button></nav>
    <main data-mode={mode} style={{ height: 'calc(100vh - 48px)' }}>
      {mode === 'editor' ? <div className="mobile-shell"><div className="mobile-model-editor mobile-root-page">
        <MobileModelConfigDetail activeProvider={catalogItem('custom')} isImageProvider={false} basicEditor={basicEditor} parameterEditor={parameterEditor} networkEditor={networkEditor} />
      </div></div> : mode === 'updates' ? <div className="mobile-shell mobile-preset-editor"><PresetIntroductionEditor preset={{ profile: { usageInstructions: '', timeline: [] } }} saving={false} error="" onClearError={() => {}} onSaveProfile={async () => true} /></div> : <div className="mobile-shell"><PresetGroupsFixture /></div>}
    </main>
  </MainPageContext.Provider>;
}
installBrowserIconSprite();
function PresetGroupsFixture() {
  const [open,setOpen]=useState(true),[selected,setSelected]=useState('');
  return <div className="mobile-preset-library"><MobilePresetLibraryBar groups={[{id:'synthetic-group',name:'合成分组',purpose:'roleplay'}]} model={{}} purpose="roleplay" open={open} onOpenChange={setOpen} selected={selected} onSelect={setSelected} onEditingChange={()=>{}} /></div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
