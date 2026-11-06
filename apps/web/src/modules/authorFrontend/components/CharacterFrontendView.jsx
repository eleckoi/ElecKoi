import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { useFrontendWorkspace } from '../hooks/useFrontendWorkspace.js';
import { characterFrontendEntry } from '../model/characterFrontend.js';
import { AdvancedFrontendFrame } from './AdvancedFrontendFrame.jsx';
import { resolveFailure } from '../../../utils/failureText.js';
import '../styles/characterFrontend.css';

export function CharacterFrontendView({ characterId, conversationId, fallback }) {
  const tUi = useProductTranslation();
  const { workspace, status, error, request } = useFrontendWorkspace(characterId);
  if (status === 'unavailable' || status === 'loading' || !characterId || !conversationId) return fallback;
  if (!workspace.selectedProjectId && !error) return fallback;
  const project = workspace.projects.find(item => item.id === workspace.selectedProjectId);
  let entryFile, failure = error;
  if (!failure) {
    try { if (!project) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '已选择的角色前端项目不存在', { what: '角色前端项目' }); entryFile = characterFrontendEntry(project, characterId); }
    catch (reason) { failure = resolveFailure(reason, { fallback: tUi("角色前端项目加载失败") }).text; }
  }
  return <section className="character-frontend-project" aria-label={tUi("角色前端")}>
    {failure && <div className="character-frontend-error" role="alert">{failure}</div>}
    {!failure && <AdvancedFrontendFrame nativeOnly project={project} entryFile={entryFile} request={request} revision={workspace.revision}
      context={{ view: 'chat', binding: { target: 'root' }, owner: { characterId, conversationId } }} />}
  </section>;
}
