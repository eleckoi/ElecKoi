import React, { createContext, useContext, useLayoutEffect, useRef } from 'react';


export function createNativeConversationPresentation(OfficialConversationContent, OfficialConversationWidthControls, OfficialConversationRoot) {
const Presentation = createContext(null);
const session = { id: 'fixture-session', running: false };
const sessions = { byId: {} };
const statuses = new Map();
const workspaces = { items: [], phase: 'ready' };
const input = {};
const conversation = { activeTargets: new Set() };
const useConversation = selector => selector(conversation);
const useSession = selector => selector(session);
const useSessions = selector => selector(sessions);
const useSessionStatus = selector => selector(statuses);
const useWorkspaces = selector => selector(workspaces);
const useInput = selector => selector(input);
const useComposerBlock = selector => selector(undefined);
const renderSlot = (name, _owner, options) => name === 'conversation.hero.frame' ? options.children : null;
const renderSlotChain = (_name, _owner, options) => options.fallback;
const Views = () => useContext(Presentation).views;
const Composer = () => useContext(Presentation).composer;
const WidthControls = props => {
  const presentation = useContext(Presentation);
  return presentation.widthControls === false ? null : <OfficialConversationWidthControls {...props} widthPreference={presentation.widthPreference} />;
};
const localComponents = { views: Views, composer: Composer, widthControls: WidthControls };
const useFactorySlot = (name, fallback) => localComponents[name] ?? fallback;

/** Real installed Content and width controls; only Session sources are fixture data. */
function NativeConversationPresentation({ presentation }) {
  const root = useRef(null);
  useLayoutEffect(() => {
    presentation.onScrollElement?.(root.current.querySelector('[data-conversation-scroll]'));
    return () => presentation.onScrollElement?.(null);
  }, [presentation.onScrollElement]);
  return <Presentation.Provider value={presentation}><div ref={root} data-eleckoi-native-frame="" style={{ display: 'contents' }}>
    <OfficialConversationRoot sessionId="fixture-session" useSession={useSession} useSessions={useSessions}
      useConversation={useConversation} renderSlot={() => null} renderFactorySlot={() => (
      <OfficialConversationContent sessionId="fixture-session" phase={presentation.phase ?? 'active'} hero={presentation.hero ?? false}
        variant={presentation.variant ?? 'main'} useSession={useSession} useSessions={useSessions} useSessionStatus={useSessionStatus}
        useWorkspaces={useWorkspaces} useInput={useInput} useComposerBlock={useComposerBlock} t={key => key}
        renderSlot={renderSlot} renderSlotChain={renderSlotChain} useFactorySlot={useFactorySlot} />
      )} />
  </div></Presentation.Provider>;
}
return presentation => <NativeConversationPresentation presentation={presentation} />;
}
