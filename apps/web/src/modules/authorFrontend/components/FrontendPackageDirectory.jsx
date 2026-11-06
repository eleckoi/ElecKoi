import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button, FileTypeIcon, IconFolderOpenRegular, IconFolderCloseRegular } from '@deepseek-ai/dsh-client-ui-primitives';

/** Package-relative entries stay independent of Session workspace paths and permissions. */
export function FrontendPackageDirectory({ files, path, onSelect }) {
  const tUi = useProductTranslation();
  const [expanded, setExpanded] = useState(() => new Set(path?.split('/').slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join('/'))));
  const scroll = useRef(null);
  const tree = useMemo(() => {
    const root = new Map();
    for (const path of new Set(['eleckoi.frontend.json', ...files])) {
      const parts = path.split('/'); let children = root;
      parts.forEach((name, index) => {
        const key = parts.slice(0, index + 1).join('/');
        if (!children.has(name)) children.set(name, { key, name, folder: index < parts.length - 1, children: new Map() });
        children = children.get(name).children;
      });
    }
    return root;
  }, [files]);
  const rows = useMemo(() => {
    const result = [];
    const visit = (children, depth) => {
      [...children.values()].sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name)).forEach(item => {
        result.push({ ...item, depth });
        if (item.folder && expanded.has(item.key)) visit(item.children, depth + 1);
      });
    };
    visit(tree, 0); return result;
  }, [tree, expanded]);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scroll.current, estimateSize: () => 32,
    initialRect: { width: 242, height: 480 }, overscan: 4, getItemKey: index => rows[index].key });
  return <nav ref={scroll} className="cf-directory" aria-label={tUi("包内文件")}>
    <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>{virtualizer.getVirtualItems().map(virtual => {
      const item = rows[virtual.index], open = expanded.has(item.key);
      const Folder = open ? IconFolderOpenRegular : IconFolderCloseRegular;
      return <div key={item.key} style={{ position: 'absolute', top: virtual.start, height: virtual.size, width: '100%' }}>
        <Button data-dsh-control size="sm" variant="ghost" className="cf-directory-row" title={item.key} aria-label={item.name}
          aria-expanded={item.folder ? open : undefined} aria-current={!item.folder && path === item.key ? 'page' : undefined}
          style={{ paddingInlineStart: 12 + item.depth * 18 }} onClick={() => item.folder ? setExpanded(previous => {
            const next = new Set(previous); if (next.has(item.key)) next.delete(item.key); else next.add(item.key); return next;
          }) : onSelect(item.key)}>
          {item.folder ? <Folder size={18} /> : <FileTypeIcon path={item.key} size={16} />}<span>{item.name}</span>
        </Button>
      </div>;
    })}</div>
  </nav>;
}
