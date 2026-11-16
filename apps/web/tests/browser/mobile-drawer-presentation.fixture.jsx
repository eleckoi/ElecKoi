import React,{useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {AppFrame} from '@deepseek-ai/dsh-client-ui-layout/src/client/AppFrame.tsx';
import {createLayoutStore} from '@deepseek-ai/dsh-client-ui-layout/src/client/stores.ts';
import {SidebarContent} from '../../src/app/windows/shell/components/SidebarContent.jsx';
import {MainPageContext} from '../../src/app/windows/MainPageContext.jsx';
import {installBrowserIconSprite} from '../helpers/browserIconSprite.js';
import '../../src/app/windows/styles/index.css';
import '../../src/mobile/mobile.css';
installBrowserIconSprite();document.documentElement.dataset.eleckoiMobile='true';
const layout=createLayoutStore().create(),noop=()=>{};
layout.actions.setSidebar(0);
const useStore=select=>select(useSyncExternalStore(layout.subscribe,layout.getSnapshot));
function Fixture(){
  const [panel,setPanel]=useState('messages');
  const current=useSyncExternalStore(layout.subscribe,layout.getSnapshot),shown=current.layoutInfo.narrowExpanded;
  window.drawerFixture={layout,setPanel};
  const change=next=>{setPanel(next);if(layout.getSnapshot().layoutInfo.narrowExpanded)layout.actions.toggleSidebar();};
  return <MainPageContext.Provider value={{registerBackHandler:()=>noop}}>
    <main className="mobile-shell" data-drawer-present={shown} style={{height:'100dvh'}}>
      <section className="mobile-page-seat"><AppFrame actions={layout.actions} useStore={useStore} usePanelInfo={select=>select({activePanelId:panel})}
        useSessions={select=>select({byId:{}})} useFoldedLandscape={select=>select(false)} t={key=>key} renderSlot={(name,owner)=>name==='sidebar'?
          <aside className="mobile-drawer official-mobile-sidebar" aria-label="侧边导航"><SidebarContent expanded compactAccount activeSection={panel}
            navigationItems={[{id:'extension-panel',label:'合成插件',icon:'extension'}]} onSectionChange={change} onNavigationAction={change}
            persona={{user_name:'合成用户'}} onOpenProfile={()=>change('profile')} onOpenSettings={()=>change('settings')}
            onCollapse={()=>layout.actions.toggleSidebar()} renderSidebarSlot={slot=>slot==='sidebar.footer.action'?<button data-footer-action onClick={()=>change('automation')}>自动化</button>:null} hasFooterActions /></aside>
          :name==='main'?<div data-retained-page style={{height:'100%',overflow:'auto',background:'var(--mobile-content-bg)'}}>
            <header className="mobile-header"><button onClick={()=>layout.actions.toggleSidebar()}>展开侧栏</button><h1>{panel}</h1></header>
            <textarea data-draft defaultValue="保留的合成草稿" />
            {Array.from({length:30},(_,i)=><p key={i}>合成内容 {i+1}</p>)}
          </div>:null} /></section>
      <nav className="mobile-bottom-nav" inert={shown||undefined}>{['messages','character','presets','model'].map(id=><button key={id} data-panel={id} onClick={()=>change(id)}>{id}</button>)}</nav>
    </main>
  </MainPageContext.Provider>;
}
createRoot(document.querySelector('#root')).render(<Fixture/>);
