import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useRef, useState } from 'react';
import {
  IconAgentPresetOutlineRegular, IconApiOutlineRegular, IconBrowseOutlineRegular, IconChevronDownOutlineRegular,
  IconCodeOutlineRegular, IconEditOutlineRegular, IconGlobeOutlineRegular, IconPlanOutlineRegular,
  IconQuestionOutlineRegular, IconSearchOutlineRegular, IconSparkleRegular, TextShimmer,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { ReadSettingIcon, SearchSettingIcon, ThoughtBulbIcon } from '../../../ui/icons/elecKoiMessageIcons.jsx';

const icons = { thinking: ThoughtBulbIcon, read: ReadSettingIcon,
  search: IconSearchOutlineRegular, 'search-setting': SearchSettingIcon,
  folder: IconBrowseOutlineRegular, edit: IconEditOutlineRegular, terminal: IconApiOutlineRegular,
  code: IconCodeOutlineRegular, globe: IconGlobeOutlineRegular, groups: IconAgentPresetOutlineRegular,
  list: IconPlanOutlineRegular, question: IconQuestionOutlineRegular, description: IconBrowseOutlineRegular };

export function AgentProcessStatus({ presentation, onClick }) {
  const tUi = useProductTranslation();
  const [displayed, setDisplayed] = useState(presentation);
  const displayedAt = useRef(Date.now());
  useEffect(() => {
    if (!presentation.running) return undefined;
    const remaining = Math.max(0, 150 - (Date.now() - displayedAt.current));
    const commit = () => { displayedAt.current = Date.now(); setDisplayed(presentation); };
    if (!remaining) { commit(); return undefined; }
    const timer = window.setTimeout(commit, remaining);
    return () => window.clearTimeout(timer);
  }, [presentation.title, presentation.target, presentation.icon, presentation.running]);
  const current = presentation.running ? displayed : presentation;
  const Icon = icons[current.icon] || IconSparkleRegular;
  const title = current.target ? `${current.title} · ${current.target}` : current.title;
  return <button type="button" className="agent-process-inline" onClick={onClick} aria-label={tUi("查看处理过程：{value0}", {value0: current.title})}>
    <span className="agent-process-inline-leading" aria-hidden="true">
      <Icon className="agent-process-inline-icon" size={14} />
      <IconChevronDownOutlineRegular className="agent-process-inline-chevron" size={14} />
    </span>
    <TextShimmer active={current.running} className="agent-process-inline-label" contentClassName="agent-process-inline-text">{title}</TextShimmer>
  </button>;
}
