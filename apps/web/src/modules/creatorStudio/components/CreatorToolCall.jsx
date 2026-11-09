import { useMemo } from 'react';
import { DisclosureRow, IconAppsAddOutlineRegular, IconArchiveCheckOutlineRegular, IconCodeOutlineRegular,
  IconEditOutlineRegular, IconFlatListOutlineRegular, IconFolderOpenOutlineRegular, IconInfoOutlineRegular,
  IconPlayOutlineRegular, IconProjectAddOutlineRegular, IconSearchOutlineRegular, IconShieldOutlineRegular,
  IconTrashOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { ReadSettingIcon } from '../../../ui/icons/elecKoiMessageIcons.jsx';
import { ToolResultBrowser, MutationDetails } from '../../chat/index.js';
import { creatorToolPresentation } from '../model/creatorToolPresentation.js';
import '../styles/creator-tool-results.css';

const icons = { list: IconFlatListOutlineRegular, info: IconInfoOutlineRegular, read: ReadSettingIcon,
  search: IconSearchOutlineRegular, edit: IconEditOutlineRegular, add: IconAppsAddOutlineRegular,
  folder: IconProjectAddOutlineRegular, move: IconFolderOpenOutlineRegular, remove: IconTrashOutlineRegular,
  check: IconShieldOutlineRegular, test: IconPlayOutlineRegular, version: IconArchiveCheckOutlineRegular };

/** Keep the official disclosure state and trajectory inspection for each atomic call. */
export function CreatorToolCall({ block, phase, callId, toolName, useDisclosure, inspect, renderNative }) {
  const tUi = useProductTranslation();
  const { expanded, toggle } = useDisclosure();
  const model = useMemo(() => creatorToolPresentation(toolName, block, phase, tUi), [toolName, block, phase, tUi]);
  if (!model) return renderNative();
  const Icon = icons[model.icon];
  const expandable = model.parts.length > 0 || Boolean(model.browser);
  return <div className="roleplay-tool-call creator-tool-call" data-creator-tool={model.domain || model.mode}
    data-creator-state={model.state} data-creator-operation={model.operation} data-tool-call-id={callId}>
    <DisclosureRow icon={<Icon size={14} />} title={model.title} open={expanded} onToggle={toggle}
      running={model.state === 'running'} expandable={expandable} expandOnRowClick keepContentWhenOpen
      titleClassName={model.state === 'error' ? 'creator-tool-error' : undefined}
      collapsedContent={model.summary ? <span className="roleplay-tool-summary"> · <span title={model.summary}>{model.summary}</span></span> : undefined}>
      {expanded && model.parts.length > 0 ? <MutationDetails parts={model.parts} label={tUi('本次调用详情')} /> : null}
      {expanded && model.browser ? <ToolResultBrowser result={model.browser} callId={callId} /> : null}
    </DisclosureRow>
    {expanded && inspect ? <button type="button" className="roleplay-tool-inspect" onClick={inspect}>
      <IconCodeOutlineRegular size={13} />{tUi('查看原始调用')}</button> : null}
  </div>;
}
