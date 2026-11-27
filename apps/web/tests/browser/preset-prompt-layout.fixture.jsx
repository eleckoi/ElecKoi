import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { withRequiredAgentPresetEntries } from '@shared/contracts/presets/builtIns';
import { PresetPromptEditor } from '../../src/modules/presets/components/PresetPromptEditor.jsx';
import { EditorPresentationContext } from '../../src/ui/ui/EditorPresentationContext.jsx';
import { createEntryDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/base.css';
import '../../src/ui/styles/editor-sidebar.css';
import '../../src/modules/settingLibraries/styles/setting-library.css';
import '../../src/modules/presets/styles/preset-panel.css';
import '../../src/mobile/mobile.css';
import '../../src/mobile/mobile-preset-editor.css';

const query = new URLSearchParams(location.search);
const compact = query.has('mobile');
document.documentElement.dataset.eleckoiMobile = String(compact);

function Fixture() {
  const [preset, setPreset] = useState(() => {
    const entries = Array.from({ length: 30 }, (_, index) => ({
      ...createEntryDraft('', index + 1, []), id: `synthetic-prompt-${index}`,
      title: index === 0 ? '[mvu_update] 合成变量更新规则（编辑角色时检查所有条件）'.repeat(6) : `合成提示词 ${index + 1}`,
      content: `合成正文 ${index + 1}`,
      ...(index < 3 && { enabled: true, agentReadStrategy: index === 0 ? 'required' : index === 1 && query.get('purpose') !== 'creator' ? 'keyword' : 'normal' }),
    }));
    return {
      id: 'synthetic-layout-preset', purpose: query.get('purpose') || 'roleplay', name: '合成预设', groups: [], expandedGroupIds: [], promptPositions: [],
      entries: query.has('built-ins') ? withRequiredAgentPresetEntries(entries) : entries,
    };
  });
  return <EditorPresentationContext.Provider value={{ compact }}>
    <main className={compact ? 'mobile-shell mobile-preset-editor' : 'preset-layout-fixture'}
      style={{ width: '100%', height: '100%', paddingInlineStart: compact ? 0 : 40 }}>
      <PresetPromptEditor workspace preset={preset} onChange={setPreset}
        saveAction={<button type="button" className="setting-library-save-button">保存</button>} />
    </main>
  </EditorPresentationContext.Provider>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
