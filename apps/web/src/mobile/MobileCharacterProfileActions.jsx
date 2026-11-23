import { useEffect, useRef, useState } from 'react';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { useProductTranslation } from '../app/i18n/ProductLocaleContext.jsx';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
import { CharacterTransferDialog } from '../modules/persona/components/CharacterTransferDialog.jsx';
import { characterName } from '../utils/characterDisplay.js';
import { MobileOverflowIcon } from './MobileIcons.jsx';
import { MobileLibraryIcon } from './MobileLibraryIcons.jsx';
import { MobileActionMenu, MobileConfirm, useMobileOperation } from './MobileLibraryChrome.jsx';
import { useCatalogSlots } from '../ui/ui/CatalogSlotsContext.jsx';

export function MobileCharacterProfileActions({ character }) {
  const tUi = useProductTranslation();
  const view = useMainPageView();
  const { actions } = useCatalogSlots();
  const [menu, setMenu] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [exportTransfer, setExportTransfer] = useState(null);
  const { busy, error, setError, run } = useMobileOperation();
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function exportCharacter(format) {
    await run(async () => {
      setExportTransfer({ names: [characterName(character, tUi)], format });
      try {
        const result = await view.characters.exportCharacters([character.id], format);
        if (result.written.length) view.chat.notify('info', tUi('已导出 {value0} 张角色卡', { value0: result.written.length }));
        if (result.failures.length) throw new DesktopError(ELECKOI_FAILURE_CODES.internal, result.failures.map(item => item.message).join('\n'), { what: '角色卡导出' });
        setMenu(null);
      } finally {
        setExportTransfer(null);
      }
    });
  }

  return <>
    {character && <button type="button" aria-label={tUi('角色操作')} aria-haspopup="menu" aria-expanded={Boolean(menu)} disabled={busy || view.routeBusy}
      onClick={event => { setError(''); setMenu(event.currentTarget); }}><MobileOverflowIcon /></button>}
    {menu && character && <MobileActionMenu title={tUi('角色操作')} anchor={menu} onClose={() => setMenu(null)} busy={busy} error={error} actions={[
      ...['png', 'zip'].map(format => ({ label: tUi('导出 {value0}', { value0: format.toUpperCase() }), icon: <MobileLibraryIcon name="export" />, action: () => exportCharacter(format) })),
      { label: tUi('删除角色'), icon: <MobileLibraryIcon name="trash" />, destructive: true, divider: true,
        action: () => { setMenu(null); setError(''); setDeleting(character); } },
    ]}>
      {actions('eleckoi.character.library.item.menu.actions', { surface: 'android', character, busy, onDismiss: () => setMenu(null) })}
    </MobileActionMenu>}
    {exportTransfer && <CharacterTransferDialog phase="exporting" {...exportTransfer} />}
    {deleting && <MobileConfirm title={tUi('删除角色？')} onClose={() => { setDeleting(null); setError(''); }} busy={busy} error={error}
      onConfirm={() => run(async () => {
        await view.chat.deleteCharacterIds([deleting.id]);
        if (active.current) { setDeleting(null); view.goBack(); }
      })}>{tUi('确认删除“{value0}”？', { value0: characterName(deleting, tUi) })}</MobileConfirm>}
  </>;
}
