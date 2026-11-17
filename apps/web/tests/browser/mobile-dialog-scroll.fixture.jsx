import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MobileModelPicker } from '../../src/mobile/MobileModelPicker.jsx';
import { MobileDialog } from '../../src/mobile/MobileChrome.jsx';
import { MobileConfirm } from '../../src/mobile/MobileLibraryChrome.jsx';
import { MobileConversationOverlay, MobileOverlayScroll } from '../../src/mobile/MobileConversationOverlay.jsx';
import { BugReportDialog } from '../../src/app/windows/shell/components/BugReportDialog.jsx';
import { SettingLibraryManager } from '../../src/modules/settingLibraries/components/SettingLibraryManager.jsx';
import { EditorVersionManager } from '../../src/ui/ui/EditorVersionManager.jsx';
import { ConfirmationDialog } from '../../src/ui/ui/ConfirmationDialog.jsx';
import { UnsavedChangesDialog } from '../../src/ui/ui/UnsavedChangesDialog.jsx';
import { AppErrorDialog } from '../../src/ui/ui/AppErrorDialog.jsx';
import { DesktopIllustrationModelPicker } from '../../src/modules/autoIllustration/components/DesktopIllustrationModelPicker.jsx';
import { FrontendWorkbenchPrompt } from '../../src/modules/authorFrontend/components/FrontendWorkbenchPrompt.jsx';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/base.css';
import '../../src/mobile/mobile.css';
import '../../src/mobile/mobile-models.css';
import '../../src/modules/settingLibraries/styles/setting-library.css';
import '../../src/app/windows/shell/styles/bug-report-dialog.css';
import '../../src/ui/styles/app-error-dialog.css';

installBrowserIconSprite();
const longText = Array.from({ length: 80 }, (_, index) => `合成诊断正文 ${index}：用于触摸滚动检查，保留完整内容。`).join('\n');
const version = { id: 'synthetic-version', name: '合成版本', groups: [], promptPositions: [], expandedGroupIds: [], listAllExpanded: true,
  entries: Array.from({ length: 60 }, (_, index) => ({ id: `synthetic-entry-${index}`, title: `合成设定 ${index}`, content: '合成正文', kind: 'normal', groupId: '', treeViewOrder: index })) };
const library = { ...version, activeVersionId: version.id, versions: [version] };
const settingLibraries = { listCharacters: async () => ({ items: Array.from({ length: 40 }, (_, index) => ({ id: `synthetic-character-${index}`, name: `合成角色 ${index}` })) }),readUntracked: async () => library };
window.dshDesktop = { bugReport: { preview: async () => ({ report: { schemaVersion: 1, generatedAt: '2026-11-17T00:00:00Z',
  environment: { appVersion: '0.3.3', platform: 'android', arch: 'arm64', osVersion: 'Synthetic Android', runtime: 'Synthetic WebView' },
  session: { startedAt: '2026-11-17T00:00:00Z', ended: true }, failures: Array.from({ length: 80 }, (_, index) => ({ code: `eleckoi/io/synthetic-${index}`, message: `合成诊断 ${index}`, details: { operation: '合成检查' } })) }, delivery: { mailbox: '', repository: '', form: {shareUrl: '', fields: {body:'body',meta:'meta',code:'code',file:'file'}} } }), drafts: async () => ({ drafts: [] }) } };
const rows = () => Array.from({ length: 80 }, (_, index) => <button key={index} type="button" style={{ minHeight: 56, width: '100%', flex: 'none' }}>合成列表选项 {index}</button>);

const initial = Array.from({ length: 100 }, (_, index) => ({ id: `synthetic-model-${String(index).padStart(3, '0')}`, name: `合成模型 ${index}` }));
document.documentElement.dataset.eleckoiMobile = 'true';
function Fixture() {
  const [items, setItems] = useState(initial), [selected, setSelected] = useState(initial[0].id), [open, setOpen] = useState(true), [kind, setKind] = useState('model');
  const close = () => setOpen(false),noop = () => {};
  window.dialogScrollFixture = { selected, count: items.length, open, kind, show: value => { setKind(value);setOpen(true); }, reset: () => { setItems(initial); setSelected(initial[0].id); setOpen(true); } };
  return <main className="mobile-shell"><button onClick={() => setOpen(true)}>打开模型列表</button>
    {open && kind === 'model' && <MobileModelPicker editor={{ modelItems: items, removableModelIds: new Set(items.map(item => item.id)), form: { model: selected },
      selectModel: id => { setSelected(id); setOpen(false); }, deleteModel: id => setItems(current => current.filter(item => item.id !== id)), setModelMenuOpen: setOpen }} />}
    {open && kind === 'bug' && <BugReportDialog open onClose={close} onNotify={noop} />}
    {open && kind === 'library' && <SettingLibraryManager characterId="synthetic-current" library={library} settingLibraries={settingLibraries} onChange={noop} onClose={close} onError={message => { throw Error(message); }} />}
    {open && kind === 'versions' && <EditorVersionManager title="合成版本管理" versions={[version]} activeVersionId={version.id} onClose={close} onSelect={noop} onCopy={noop} onCreate={noop} onRename={noop} onDelete={noop}>{rows()}</EditorVersionManager>}
    {open && kind === 'mobile' && <MobileDialog title="合成移动弹窗" onClose={close}>{rows()}</MobileDialog>}
    {open && kind === 'confirm' && <MobileConfirm title="合成移动确认" onClose={close} onConfirm={noop}>{rows()}</MobileConfirm>}
    {open && kind === 'confirmation' && <ConfirmationDialog open title="合成确认" description={longText} onCancel={close} onConfirm={noop} />}
    {open && kind === 'unsaved' && <UnsavedChangesDialog open title="合成保存确认" error={longText} onCancel={close} onDiscard={noop} onSave={noop} />}
    {open && kind === 'error' && <AppErrorDialog notice={{ message: longText }} onDismiss={close} />}
    {open && kind === 'illustration' && <DesktopIllustrationModelPicker subtitle="合成绘图模型" tab="models" onTabChange={noop} onClose={close} onSave={noop}>{rows()}</DesktopIllustrationModelPicker>}
    {open && kind === 'author' && <FrontendWorkbenchPrompt question={{ title: '合成作者确认', message: longText, confirmLabel: '确定' }} onResolve={close} />}
    {open && ['sheet', 'page'].includes(kind) && <MobileConversationOverlay title="合成聊天浮层" kind={kind} onClose={close}><MobileOverlayScroll>{rows()}</MobileOverlayScroll></MobileConversationOverlay>}
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
