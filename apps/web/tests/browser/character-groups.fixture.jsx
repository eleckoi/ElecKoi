import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CharacterGroupList } from '../../src/modules/persona/components/CharacterGroupList.jsx';
import { useSidebarListScroll } from '../../src/ui/hooks/useSidebarListScroll.js';
import { SidebarScrollArea } from '../../src/ui/ui/SidebarScrollArea.jsx';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/dsh-theme-bridge.css';
import '../../src/app/windows/styles/base.css';
import '../../src/modules/persona/styles/character-list.css';
import '../../src/app/windows/styles/dark-theme.css';

const groups = ['合成分组甲', '合成分组乙'];
const characters = { items: Array.from({ length: 90 }, (_, index) => ({
  id: `synthetic-${index}`, name: `合成角色 ${index + 1}`, group: groups[index < 45 ? 0 : 1], persona: {},
})) };
function Fixture() {
  const [collapsed, setCollapsed] = useState({ '全部角色': true, [groups[0]]: true, [groups[1]]: true });
  const scrollRef = useSidebarListScroll();
  return <aside className="character-list-panel" style={{ width: '100%', height: '100vh' }}>
    <header style={{ padding: 12 }}>合成角色目录</header>
    <div />
    <div className="character-list-tabs"><button>角色</button><button>群聊</button></div>
    <SidebarScrollArea className="character-list-scroll" ref={scrollRef}>
      <CharacterGroupList groups={groups} characters={characters} artworkMode="avatar" collapsedGroups={collapsed}
        onToggleGroup={group => setCollapsed(value => ({ ...value, [group]: !value[group] }))}
        onSelectCharacter={() => {}} onOpenCharacterChat={() => {}} onDragStart={() => {}} onDragOver={() => {}} onDrop={() => {}} />
    </SidebarScrollArea>
  </aside>;
}
createRoot(document.querySelector('#root')).render(<Fixture />);
