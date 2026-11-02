import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { InputBar, DraftEditorRuntime, registerPlainText, ComposerAttachments } from 'official-composer-fixture';
import { RoleplayInputMenu } from '../../src/modules/chat/components/RoleplayInputMenu.jsx';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/base.css';
import '../../src/modules/chat/styles/chat-panel.css';
import '../../src/modules/creatorStudio/styles/creator-studio-simple.css';
import '../../src/mobile/mobile.css';

const hook = value => select => select(value);
const translate = (key, values = {}) => key + (values.name ? ` ${values.name}` : '');
const runtime = new DraftEditorRuntime(), editor = runtime.editor;
registerPlainText(editor);
const keyboard = { editor, arbitrate: () => 'pass', space: () => false, dismissPopup() {},
  bindFilePicker: () => () => {}, submit() {}, steerQueue() {} };
const query = new URLSearchParams(location.search), studio = query.get('surface') === 'studio';
const mobile = query.get('mobile') === 'true';
const slot = studio ? 'conversation.input.attachments' : 'eleckoi.roleplay.conversation.input.attachments';
function Fixture() {
  const [attachments, setAttachments] = useState([]);
  window.composerFixture = { setCount(count) {
    setAttachments(Array.from({ length: count }, (_, index) => ({ id: `file-${index}`, kind: 'file',
      file: new File(['synthetic attachment'], `synthetic-${index}-${'long-name-'.repeat(8)}.txt`, { type: 'text/plain' }) })));
  } };
  React.useEffect(() => { runtime.setDraft('合成草稿'); }, []);
  const input = { draft: '合成草稿', attachmentIds: attachments.map(item => item.id), queue: [], phase: 'plain' };
  const uploads = Object.fromEntries(attachments.map(item => [item.id, { status: 'ready' }]));
  if (query.has('official')) return <ComposerAttachments attachments={attachments} uploads={uploads} t={translate}
    canAcceptDrop={false} onAddFiles={() => {}} onRetryFile={() => {}} onRemoveAttachment={id => setAttachments(items => items.filter(item => item.id !== id))} />;
  const bar = <div data-slot={studio ? 'eleckoi.creator-studio.composer.bar' : 'eleckoi.roleplay.conversation.composer.bar'}>
    <InputBar useSession={hook({ running: false })} useInput={hook(input)} useNotices={hook(null)}
      useBusyEnter={hook('queue')} useStopShortcut={hook([])} useMenuLauncher={hook(null)}
      useFileUploads={hook(uploads)} useLexicon={hook([])} useProjection={() => undefined}
      inputActions={{}} keyboard={keyboard} t={translate} sessionId="synthetic-session" variant="composer"
      submitOnEnter={!mobile} dockAccessory={[]} resolveDraftAttachments={() => attachments}
      removeAttachment={id => setAttachments(items => items.filter(item => item.id !== id))}
      leadingAccessory={<RoleplayInputMenu purpose={studio ? 'creator' : 'roleplay'} isSending={false} />}
      modelAccessory={<button>合成模型</button>}
      renderSlot={(name, owner) => name === 'conversation.input.attachments'
        ? <div data-slot={slot}><ComposerAttachments {...owner} t={translate} /></div> : null} />
  </div>;
  const seat = <div className={`chat-composer-region${studio ? ' creator-simple-composer' : ''}`} data-composer-seat="">{bar}</div>;
  return <main className={mobile ? 'mobile-shell mobile-conversation-page' : ''}>
    {studio ? <section className="creator-simple-conversation">
      <header style={{ height: 76, flex: 'none' }}>合成工作室</header>
      <div className="creator-simple-conversation-scroll"><div className="creator-simple-transcript">合成正文</div>{seat}</div>
    </section> : <section className="chat-panel"><header>合成角色</header><div className="chat-conversation-body">
      <div className="message-area layout-agent"><div className="chat-transcript-region">合成正文</div>{seat}</div>
    </div></section>}
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
