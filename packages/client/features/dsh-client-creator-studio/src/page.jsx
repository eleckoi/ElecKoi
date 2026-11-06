import { useProductTranslation } from '../../../../../apps/web/src/app/i18n/ProductLocaleContext.jsx';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useMainPageView } from '../../../../../apps/web/src/app/windows/MainPageContext.jsx';
import { CreatorStudioConversation } from '../../../../../apps/web/src/modules/creatorStudio/components/CreatorStudioConversation.jsx';
import { CreatorStudioCharacterDialog } from '../../../../../apps/web/src/modules/creatorStudio/components/CreatorStudioSimplePage.jsx';
import { FailureAlert } from '../../../../../apps/web/src/ui/ui/FailureAlert.jsx';

export function CreatorStudioPage() {
  const tUi = useProductTranslation();
  const view = useMainPageView(), model = view.creatorStudio.sessions;
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const characters = useSyncExternalStore(view.characters.subscribe, view.characters.getSnapshot);
  const [picker, setPicker] = useState(false), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const lifetime = useRef(0);
  async function perform(action) {
    setError(null); setBusy(true);
    try { return await action(); } catch (cause) { setError(cause); } finally { setBusy(false); }
  }
  useEffect(() => {
    const version = ++lifetime.current;
    void perform(() => model.restoreRecent());
    return () => queueMicrotask(() => { if (lifetime.current === version) model.release(); });
  }, [model]);
  const active = state.items.find(item => item.sessionId === state.active?.sessionId);
  return view.renderLayout({ sidePanel: null, mainPanel: <section className="creator-simple-content creator-main-content" aria-label={tUi("创作工作室")}>
    <FailureAlert failure={error || state.error} className="creator-simple-error" />
    {state.reference ? view.renderCreatorStudioConversation({ reference: state.reference, component: CreatorStudioConversation,
      props: { model, models: view.models, presetCatalog: view.presets, title: active?.title,
        editing: state.editingSessionId === state.active?.sessionId, creating: busy,
        onCreate: () => perform(() => model.create(state.active?.characterId || '')),
        onSelectCharacter: () => setPicker(true), onError: setError } }) :
      <div className="creator-simple-loading">{busy || state.status === 'loading' ? tUi("正在打开工作室…") : <button type="button" onClick={() => perform(() => model.restoreRecent())}>{tUi("重试")}</button>}</div>}
    {picker && <CreatorStudioCharacterDialog collection={characters.collection} selectedId={state.active?.characterId || ''} busy={busy} error={error}
      onClose={() => setPicker(false)} onSelect={id => perform(async () => { await model.selectCharacter(id); setPicker(false); })} />}
  </section> });
}
