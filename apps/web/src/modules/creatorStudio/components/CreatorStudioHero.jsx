import { useRef, useState, useSyncExternalStore } from 'react';
import { IconAgentPresetOutlineRegular, IconChevronDownOutlineRegular, IconFolderCloseRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace';
import whaleMaidHeart from '../../../assets/creator-studio/whale-maid-heart.png';
import '../styles/creator-studio-hero.css';

const empty = { catalog: null }, subscribeEmpty = () => () => {}, readEmpty = () => empty;

export function CreatorStudioHero({ model, sessionId, presetCatalog, useWorkspaces, renderSlot, onError }) {
  const registry = useWorkspaces(value => value);
  const workspace = registry.items.find(item => item.sessionIds.includes(sessionId));
  const snapshot = useSyncExternalStore(presetCatalog?.subscribe || subscribeEmpty, presetCatalog?.getSnapshot || readEmpty);
  const presets = snapshot.catalog?.presets.filter(item => item.purpose === 'creator') || [];
  const activePreset = snapshot.catalog?.activePresetIds.creator;
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false), [presetOpen, setPresetOpen] = useState(false), [changing, setChanging] = useState(false);
  async function choosePreset(id) {
    setPresetOpen(false); setChanging(true);
    try { await presetCatalog.setActive(id); } catch (error) { onError(error); } finally { setChanging(false); }
  }
  return <>
    <div className="creator-studio-hero-headline"><img className="creator-studio-hero-mascot" src={whaleMaidHeart} width={48} height={44} alt="" draggable={false} /><span>人，你会想念我吗？</span></div>
    <div className="creator-studio-hero-selectors">
      <button ref={anchorRef} type="button" className="creator-studio-hero-choice" aria-label="选择工作区" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(value => !value)}>
        <IconFolderCloseRegular size={16} /><span>{workspace ? workspaceDisplayTitle(workspace.title, '默认工作区') : '选择工作区'}</span><IconChevronDownOutlineRegular size={12} />
      </button>
      {renderSlot('eleckoi.creator-studio.hero.workspace', { open, anchorRef, selectedId: workspace?.workspaceId,
        onPick: id => { setOpen(false); void model.startWorkspace(id).catch(onError); }, onClose: () => setOpen(false) })}
      <Menu open={presetOpen} onClose={() => setPresetOpen(false)} portal align="start" dense selectedId={activePreset}
        items={presets.map(item => ({ id: item.id, label: item.name }))}
        onSelect={choosePreset} anchor={<button type="button" className="creator-studio-hero-choice" aria-label="选择创作预设" aria-haspopup="menu" aria-expanded={presetOpen}
          disabled={changing || !presets.length} onClick={() => setPresetOpen(value => !value)}>
          <IconAgentPresetOutlineRegular size={16} /><span>{presets.find(item => item.id === activePreset)?.name || '创作预设'}</span><IconChevronDownOutlineRegular size={12} />
        </button>} />
    </div>
  </>;
}
