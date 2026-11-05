import { useEffect, useMemo, useState } from "react";
import {
  PluginArtworkDefault,
  PluginArtworkLoop,
  PluginArtworkSearch,
  PluginArtworkSubagent,
  PluginArtworkTerminal,
} from "../../../../ui/icons/dshPluginArtwork.jsx";
import { ChevronRightIcon } from "../../../../ui/icons/index.jsx";
import { SidebarSectionHeader } from "../../../../ui/ui/SidebarSectionHeader.jsx";
import { useSidebarListScroll } from "../../../../ui/hooks/useSidebarListScroll.js";
import { SidebarScrollArea } from "../../../../ui/ui/SidebarScrollArea.jsx";
import { useSidebarGroupCollapse } from "../../../../ui/hooks/useSidebarGroupCollapse.js";
import { LIST_COLLAPSE_AREAS, usePersistentCollapseState } from "../../../../modules/settings/index.js";
import "../styles/plugin-center.css";

const GROUPS = [
  { id: "official", label: "DSH 官方插件" },
  { id: "eleckoi", label: "ElecKoi 内置插件" },
  { id: "installed", label: "用户安装插件" },
];
const GROUP_IDS = GROUPS.map((group) => group.id);

const ITEM_ARTWORK = {
  shell: PluginArtworkTerminal,
  "agent-loop": PluginArtworkLoop,
  subagent: PluginArtworkSubagent,
  "web-search": PluginArtworkSearch,
};

function PluginIcon({ item }) {
  const [failedSource, setFailedSource] = useState("");
  const Artwork = item.kind === "item" ? ITEM_ARTWORK[item.id] || PluginArtworkDefault : PluginArtworkDefault;
  return <span className="plugin-list-icon">
    {item.icon && item.icon !== failedSource
      ? <img src={item.icon} alt="" onError={() => setFailedSource(item.icon)} />
      : <Artwork size={22} />}
  </span>;
}

export { applySidebarListWheel as applyPluginListWheel } from "../../../../ui/hooks/useSidebarListScroll.js";

export function PluginListPanel({ onNotify }) {
  const [entries, setEntries] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [collapsed, setCollapsed, collapseStateReady] = usePersistentCollapseState(
    LIST_COLLAPSE_AREAS.plugins,
    {},
    GROUP_IDS,
  );
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const scrollRef = useSidebarListScroll();
  const keepCollapsedHeading = useSidebarGroupCollapse(collapsed);

  useEffect(() => {
    const receive = (event) => {
      setEntries(event.detail?.entries || []);
      setSelectedId(event.detail?.selected || "");
      setError(event.detail?.status === "error" ? "插件列表加载失败" : "");
    };
    window.addEventListener("eleckoi:dsh-plugins:state", receive);
    window.dispatchEvent(new Event("eleckoi:dsh-plugins:request"));
    return () => {
      window.removeEventListener("eleckoi:dsh-plugins:state", receive);
    };
  }, []);

  const filtered = useMemo(() => {
    const key = keyword.trim().toLocaleLowerCase();
    return entries.filter((item) => !key || item.name.toLocaleLowerCase().includes(key));
  }, [entries, keyword]);

  function select(item) {
    const result = { id: item.id, kind: item.kind, opened: false, error: null };
    window.dispatchEvent(new CustomEvent("eleckoi:dsh-plugins:select", { detail: result }));
    if (result.opened) setSelectedId(`${item.kind}:${item.id}`);
    else onNotify("error", result.error || "插件详情暂时无法打开");
  }

  function add() {
    const result = { opened: false, error: null };
    window.dispatchEvent(new CustomEvent("eleckoi:dsh-plugins:add", { detail: result }));
    if (result.opened) setSelectedId("");
    else onNotify("error", result.error || "添加插件入口暂时无法打开");
  }

  return <aside className="character-list-panel plugin-list-panel" aria-label="插件列表">
    <SidebarSectionHeader title="插件" value={keyword} onValueChange={setKeyword} placeholder="搜索插件名称"
      createLabel="添加插件" onCreate={add} />
    <SidebarScrollArea ref={scrollRef} className="character-list-scroll preset-list-scroll">
      {collapseStateReady ? GROUPS.map((group) => {
        const items = filtered.filter((entry) => entry.group === group.id);
        const isCollapsed = Boolean(collapsed[group.id]);
        return <section className="character-group-block preset-list-group" key={group.id}>
          <button type="button" className="character-group-row preset-group-heading" aria-expanded={!isCollapsed} onClick={(event) => {
            if (!isCollapsed) keepCollapsedHeading(event.currentTarget);
            setCollapsed((current) => ({ ...current, [group.id]: !current[group.id] }));
          }}>
            <span><span className={`character-group-toggle${isCollapsed ? " collapsed" : ""}`}><ChevronRightIcon /></span>{group.label}</span>
            <em>{items.length}</em>
          </button>
          {!isCollapsed ? <div className="character-contact-list preset-list-rows">
            {items.map((item) => <button type="button" key={`${item.kind}:${item.id}`} className={`character-contact-row plugin-list-row${selectedId === `${item.kind}:${item.id}` ? " active" : ""}`} onClick={() => select(item)} title={item.name}>
              <PluginIcon item={item} />
              <span className="character-contact-copy"><strong>{item.name}</strong></span>
            </button>)}
          </div> : null}
        </section>;
      }) : null}
      {error ? <p className="preset-list-state is-error">{error}</p> : null}
    </SidebarScrollArea>
  </aside>;
}

export function PluginCenterSurface({ children }) {
  return <div className="plugin-center-surface" data-eleckoi-plugin-panel aria-label="插件中心">{children}</div>;
}
