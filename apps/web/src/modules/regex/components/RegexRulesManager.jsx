import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { EditorLibraryVersionManager } from '../../../ui/ui/EditorLibraryVersionManager.jsx';

export function RegexRulesManager({ libraryVersions, ownerScope, initialScope, busy, onClose }) {
  const tUi = useProductTranslation();
  return <EditorLibraryVersionManager title={tUi("正则版本管理")} versions={libraryVersions} ownerScope={ownerScope} initialScope={initialScope}
    ownerLabel={ownerScope === 'preset' ? tUi("预设") : tUi("角色卡")} busy={busy} onClose={onClose} />;
}
