// NODE STUDIO: retained node/project development surface for future main-window integration.
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { FailureAlert } from '../../../ui/ui/FailureAlert.jsx';
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowSquareOut,
  CalendarBlank,
  Folder,
  FolderSimplePlus,
  IdentificationCard,
  ListBullets,
  MagnifyingGlass,
  SquaresFour,
  UserFocus,
  X,
} from "../../../ui/icons/interfaceIcons.jsx";
import {
  DshCheckIcon,
  DshChevronDownIcon,
  DshChevronRightIcon,
  DshPlusIcon,
} from "../../../ui/icons/dshComposerIcons.jsx";
import { TrashIcon } from "../../../ui/icons/index.jsx";
import {
  CreatorStudioAssetsIcon,
  CreatorStudioProjectsIcon,
  CreatorStudioSkillsIcon,
} from "./CreatorStudioNavigationIcons.jsx";
import { failureAlreadyPublished } from "../../../utils/swallowedFailure.js";

const CREATE_OPTIONS = [
  { id: "blank", title: "从零创作角色", description: "建立空白角色项目", Icon: FolderSimplePlus },
  { id: "existing", title: "修改已有角色", description: "以当前角色卡为起点", Icon: UserFocus },
];

const NAV_ITEMS = [
  { id: "projects", title: "创作项目", Icon: CreatorStudioProjectsIcon },
  { id: "assets", title: "资产", Icon: CreatorStudioAssetsIcon },
  { id: "skills", title: "技能", Icon: CreatorStudioSkillsIcon },
];

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100, 200, 500];

export function paginateCreatorProjects(projects, requestedPage, pageSize) {
  const totalPages = Math.max(1, Math.ceil(projects.length / pageSize));
  const currentPage = Math.min(totalPages, Math.max(1, requestedPage));
  const firstProjectIndex = (currentPage - 1) * pageSize;
  return {
    currentPage,
    totalPages,
    items: projects.slice(firstProjectIndex, firstProjectIndex + pageSize),
  };
}

function EmptyProjectArtwork() {
  return <div className="creator-studio-empty-artwork" aria-hidden="true">
    <span className="creator-studio-empty-card creator-studio-empty-card-back" />
    <span className="creator-studio-empty-card creator-studio-empty-card-front">
      <IdentificationCard size={40} weight="duotone" />
    </span>
  </div>;
}

function formatProjectTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date).replaceAll("/", "-");
}

function ProjectPreview({ project }) {
  if (project.coverImage) return <img src={project.coverImage} alt="" draggable="false" />;
  return <span className="creator-studio-project-fallback" aria-hidden="true"><Folder size={30} /></span>;
}

function ProjectDeleteConfirm({ project, busy, error, onCancel, onConfirm }) {
  return <div className="creator-studio-delete-confirm" role="dialog" aria-modal="false" aria-labelledby={`delete-project-${project.id}`} onClick={(event) => event.stopPropagation()}>
    <strong id={`delete-project-${project.id}`}>删除项目</strong>
    <p>“{project.name}”及其中的本地文件会被永久删除，此操作不可撤销。</p>
    <FailureAlert failure={error} className="creator-studio-delete-error" />
    <div>
      <button type="button" onClick={onCancel} disabled={busy}>取消</button>
      <button className="is-danger" type="button" onClick={onConfirm} disabled={busy}>{busy ? "删除中…" : "确认删除"}</button>
    </div>
  </div>;
}

export function ProjectCollection({ projects, viewMode, pendingDeletionId, deletingProjectId, deleteError, onOpenProject, onRequestDelete, onCancelDelete, onConfirmDelete }) {
  if (projects.length === 0) {
    return <div className="creator-studio-project-empty">
      <EmptyProjectArtwork />
      <h2>还没有创作项目</h2>
      <p>新建项目后会显示在这里。</p>
    </div>;
  }

  if (viewMode === "grid") {
    return <div className="creator-studio-project-grid">
      {projects.map((project) => <article
        className="creator-studio-grid-card"
        key={project.id}
      >
        <button
          className="creator-studio-project-open-surface"
          type="button"
          aria-label={`进入项目 ${project.name}`}
          disabled={pendingDeletionId === project.id}
          onClick={() => onOpenProject(project)}
        />
        <div className={`creator-studio-grid-preview${project.coverImage ? " has-cover" : ""}`}>
          <ProjectPreview project={project} />
          <h2>{project.name}</h2>
          <div className="creator-studio-grid-overlay">
            <div className="creator-studio-card-actions">
              <button className="is-delete" type="button" onClick={(event) => { event.stopPropagation(); onRequestDelete(project); }} title="删除项目" aria-label={`删除项目 ${project.name}`}>
                <TrashIcon size={16} />
              </button>
              <button type="button" onClick={(event) => { event.stopPropagation(); onOpenProject(project); }} title="当前页查看" aria-label={`在当前页查看 ${project.name}`}>
                <ArrowSquareOut size={17} weight="bold" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="creator-studio-grid-overlay-meta"><span>角色项目</span><time>{formatProjectTime(project.updatedAt)}</time></div>
        </div>
        {pendingDeletionId === project.id ? <ProjectDeleteConfirm
          project={project}
          busy={deletingProjectId === project.id}
          error={deleteError}
          onCancel={onCancelDelete}
          onConfirm={() => onConfirmDelete(project)}
        /> : null}
      </article>)}
    </div>;
  }

  return <div className="creator-studio-project-list">
    {projects.map((project) => <article
      className="creator-studio-list-card"
      key={project.id}
    >
      <button
        className="creator-studio-project-open-surface"
        type="button"
        aria-label={`进入项目 ${project.name}`}
        disabled={pendingDeletionId === project.id}
        onClick={() => onOpenProject(project)}
      />
      <header>
        <div className="creator-studio-list-meta">
          <span className="creator-studio-list-meta-icon"><IdentificationCard size={17} weight="duotone" aria-hidden="true" /></span>
          <span>
            <strong>角色项目</strong>
            <time><CalendarBlank size={14} aria-hidden="true" />{formatProjectTime(project.updatedAt)}</time>
          </span>
        </div>
        <div className="creator-studio-list-actions">
          <button className="is-delete" type="button" onClick={(event) => { event.stopPropagation(); onRequestDelete(project); }} title="删除项目" aria-label={`删除项目 ${project.name}`}><TrashIcon size={16} /></button>
          <button type="button" onClick={(event) => { event.stopPropagation(); onOpenProject(project); }}>
            当前页查看<DshChevronRightIcon size={13} aria-hidden="true" />
          </button>
          {pendingDeletionId === project.id ? <ProjectDeleteConfirm
            project={project}
            busy={deletingProjectId === project.id}
            error={deleteError}
            onCancel={onCancelDelete}
            onConfirm={() => onConfirmDelete(project)}
          /> : null}
        </div>
      </header>
      <div className="creator-studio-list-body">
        <div className="creator-studio-list-content">
          <div className="creator-studio-list-preview"><ProjectPreview project={project} /></div>
          <div><h2>{project.name}</h2><p title={project.rootPath}>{project.rootPath}</p></div>
        </div>
      </div>
    </article>)}
  </div>;
}

export function CreatorStudioPagination({ pageSize, currentPage, totalPages, onPageSizeChange, onPageChange }) {
  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  const [pageDraft, setPageDraft] = useState(String(currentPage));
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);

  useEffect(() => {
    setPageDraft(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    if (!pageSizeOpen) return undefined;
    const selectedIndex = PAGE_SIZE_OPTIONS.indexOf(pageSize);
    optionRefs.current[Math.max(0, selectedIndex)]?.focus();
    const closeOnOutsidePointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setPageSizeOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setPageSizeOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [pageSize, pageSizeOpen]);

  const commitPageDraft = () => {
    const parsed = Number.parseInt(pageDraft, 10);
    const nextPage = Number.isFinite(parsed) ? Math.min(totalPages, Math.max(1, parsed)) : currentPage;
    setPageDraft(String(nextPage));
    onPageChange(nextPage);
  };

  const focusAdjacentOption = (event) => {
    const currentIndex = optionRefs.current.findIndex((option) => option === document.activeElement);
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown") nextIndex = Math.min(PAGE_SIZE_OPTIONS.length - 1, currentIndex + 1);
    else if (event.key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = PAGE_SIZE_OPTIONS.length - 1;
    else return;
    event.preventDefault();
    optionRefs.current[nextIndex]?.focus();
  };

  return <nav className="creator-studio-pagination" aria-label="项目分页">
    <div className="creator-studio-page-size-control">
      <span>每页显示</span>
      <div className="creator-studio-page-size" ref={rootRef}>
        <button
          className="creator-studio-page-size-trigger"
          type="button"
          ref={triggerRef}
          aria-label="每页显示条数"
          aria-haspopup="listbox"
          aria-expanded={pageSizeOpen}
          aria-controls="creator-studio-page-size-options"
          onClick={() => setPageSizeOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            setPageSizeOpen(true);
          }}
        >
          <span>{pageSize}</span><DshChevronDownIcon size={12} />
        </button>
        {pageSizeOpen ? <div
          className="creator-studio-page-size-options"
          id="creator-studio-page-size-options"
          role="listbox"
          aria-label="每页显示条数"
          onKeyDown={focusAdjacentOption}
        >
          {PAGE_SIZE_OPTIONS.map((size, index) => <button
            type="button"
            role="option"
            aria-selected={pageSize === size}
            className={pageSize === size ? "is-selected" : ""}
            key={size}
            ref={(element) => { optionRefs.current[index] = element; }}
            onClick={() => {
              onPageSizeChange(size);
              setPageSizeOpen(false);
              triggerRef.current?.focus();
            }}
          >
            <span>{size}</span>{pageSize === size ? <DshCheckIcon size={12} /> : null}
          </button>)}
        </div> : null}
      </div>
      <span>条</span>
    </div>

    <div className="creator-studio-page-actions">
      <button type="button" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
        <DshChevronRightIcon className="is-previous" size={12} />上一页
      </button>
      <label className="creator-studio-page-jump">
        <span>第</span>
        <input
          type="text"
          inputMode="numeric"
          aria-label="页码"
          title="点击输入页码，回车确认"
          value={pageDraft}
          onChange={(event) => setPageDraft(event.target.value.replace(/\D/g, ""))}
          onBlur={commitPageDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitPageDraft();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              setPageDraft(String(currentPage));
              event.currentTarget.blur();
            }
          }}
        />
        <span>页</span>
      </label>
      <button type="button" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>
        下一页<DshChevronRightIcon size={12} />
      </button>
    </div>
  </nav>;
}

function CreateProjectDialog({ characters, projectCatalog, onClose, onCreated }) {
  const [mode, setMode] = useState("blank");
  const [name, setName] = useState("");
  const [parentDirectory, setParentDirectory] = useState("");
  const [sourceCharacterId, setSourceCharacterId] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef(null);
  const directoryRequestRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
    const handleKeyDown = (event) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  useEffect(() => () => directoryRequestRef.current?.abort(), []);

  const chooseDirectory = async () => {
    setError(null);
    directoryRequestRef.current?.abort();
    const request = new AbortController();
    directoryRequestRef.current = request;
    try {
      const directory = await projectCatalog.selectDirectory(request.signal);
      if (directory && !request.signal.aborted) setParentDirectory(directory);
    } catch (requestError) {
      if (!request.signal.aborted) setError(requestError ?? "无法选择保存位置。");
    } finally {
      if (directoryRequestRef.current === request) directoryRequestRef.current = null;
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) { setError("请输入项目名称。"); nameRef.current?.focus(); return; }
    if (!parentDirectory) { setError("请选择项目保存位置。"); return; }
    if (mode === "existing" && !sourceCharacterId) { setError("请选择要修改的角色。"); return; }
    setBusy(true);
    try {
      const collection = await projectCatalog.create({
        name: name.trim(), mode, parentDirectory,
        ...(mode === "existing" ? { sourceCharacterId } : {}),
      });
      onCreated(collection.items);
    } catch (requestError) {
      setError(requestError ?? "项目创建失败。");
    } finally {
      setBusy(false);
    }
  };

  return <SystemBarOverlay className="creator-studio-dialog-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}>
    <section className="creator-studio-create-dialog" role="dialog" aria-modal="true" aria-labelledby="creator-studio-create-title">
      <header>
        <h2 id="creator-studio-create-title">新建项目</h2>
        <button type="button" onClick={onClose} disabled={busy} aria-label="关闭新建项目窗口"><X size={18} aria-hidden="true" /></button>
      </header>
      <form onSubmit={submit}>
        <div className="creator-studio-create-options" role="group" aria-label="创建方式">
          {CREATE_OPTIONS.map(({ id, title, description, Icon }) => <button
            className={mode === id ? "is-selected" : ""} type="button" aria-pressed={mode === id} key={id} onClick={() => setMode(id)}
          >
            <span className="creator-studio-create-option-icon"><Icon size={21} weight="duotone" aria-hidden="true" /></span>
            <span><strong>{title}</strong><small>{description}</small></span>
          </button>)}
        </div>

        <label className="creator-studio-form-field">
          <span>项目名称</span>
          <input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} placeholder="未命名项目" />
        </label>

        {mode === "existing" ? <label className="creator-studio-form-field">
          <span>选择角色</span>
          <select value={sourceCharacterId} onChange={(event) => setSourceCharacterId(event.target.value)}>
            <option value="">请选择角色</option>
            {characters.map((character) => <option value={character.id} key={character.id}>{character.name || "未命名角色"}</option>)}
          </select>
        </label> : null}

        <div className="creator-studio-form-field">
          <span>保存位置</span>
          <div className="creator-studio-directory-field">
            <input value={parentDirectory} readOnly placeholder="选择本地文件夹" aria-label="项目保存位置" />
            <button type="button" onClick={chooseDirectory}>选择文件夹</button>
          </div>
        </div>

        <FailureAlert failure={error} className="creator-studio-form-error" />
        <footer>
          <button type="button" onClick={onClose} disabled={busy}>取消</button>
          <button className="is-primary" type="submit" disabled={busy}>{busy ? "创建中…" : "创建项目"}</button>
        </footer>
      </form>
    </section>
  </SystemBarOverlay>;
}

function LibraryPage({ page }) {
  const isAssets = page === "assets";
  const Icon = isAssets ? CreatorStudioAssetsIcon : CreatorStudioSkillsIcon;
  return <div className="creator-studio-home-inner">
    <div className="creator-studio-home-heading"><h1>{isAssets ? "资产" : "技能"}</h1></div>
    <section className="creator-studio-library-empty">
      <Icon size={28} />
      <h2>{isAssets ? "暂无资产" : "暂无可用技能"}</h2>
    </section>
  </div>;
}

export function CreatorStudioProjectHome({ sidebarCollapsed = false, characterCatalog, projectCatalog, onOpenProject = () => {} }) {
  const [activePage, setActivePage] = useState("projects");
  const [viewMode, setViewMode] = useState("grid");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingDeletionId, setPendingDeletionId] = useState("");
  const [deletingProjectId, setDeletingProjectId] = useState("");
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    const updateCharacters = () => {
      const snapshot = characterCatalog.getSnapshot();
      if (snapshot.status === "ready") setCharacters(snapshot.collection.items);
    };
    const updateProjects = () => {
      const snapshot = projectCatalog.getSnapshot();
      if (snapshot.status === "ready") setProjects(snapshot.collection.items);
    };
    const stopCharacters = characterCatalog.subscribe(updateCharacters);
    const stopProjects = projectCatalog.subscribe(updateProjects);
    updateCharacters();
    updateProjects();
    void characterCatalog.refresh().catch(failureAlreadyPublished);
    void projectCatalog.refresh().catch(failureAlreadyPublished);
    return () => { stopCharacters(); stopProjects(); };
  }, [characterCatalog, projectCatalog]);

  useEffect(() => {
    if (!pendingDeletionId) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !deletingProjectId) {
        setPendingDeletionId("");
        setDeleteError(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [pendingDeletionId, deletingProjectId]);

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return projects;
    return projects.filter((project) => project.name.toLocaleLowerCase().includes(normalized));
  }, [projects, query]);

  const projectPage = useMemo(
    () => paginateCreatorProjects(filteredProjects, currentPage, pageSize),
    [currentPage, filteredProjects, pageSize],
  );
  const { items: visibleProjects, totalPages } = projectPage;

  useEffect(() => {
    if (currentPage === projectPage.currentPage) return;
    setCurrentPage(projectPage.currentPage);
  }, [currentPage, projectPage.currentPage]);

  const requestDelete = (project) => {
    setPendingDeletionId(project.id);
    setDeleteError(null);
  };

  const cancelDelete = () => {
    if (deletingProjectId) return;
    setPendingDeletionId("");
    setDeleteError(null);
  };

  const confirmDelete = async (project) => {
    setDeletingProjectId(project.id);
    setDeleteError(null);
    try {
      await projectCatalog.delete(project.id);
      setPendingDeletionId("");
    } catch (requestError) {
      setDeleteError(requestError ?? "无法删除项目。");
    } finally {
      setDeletingProjectId("");
    }
  };

  const changePage = (nextPage) => {
    setCurrentPage(Math.min(totalPages, Math.max(1, nextPage)));
  };

  const changePageSize = (nextPageSize) => {
    setPageSize(nextPageSize);
    setCurrentPage(1);
  };

  return <div className={`creator-studio-layout${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
    <aside className="creator-studio-sidebar" aria-label="工作室侧边栏">
      <nav className="creator-studio-sidebar-nav" aria-label="工作室导航">
        {NAV_ITEMS.map(({ id, title, Icon }) => <button
          className={activePage === id ? "is-active" : ""}
          type="button" aria-current={activePage === id ? "page" : undefined} aria-label={title} title={title} key={id} onClick={() => setActivePage(id)}
        >
          <Icon size={20} /><span>{title}</span>
        </button>)}
      </nav>
    </aside>

    <div className="creator-studio-home">
      {activePage === "projects" ? <div className="creator-studio-home-inner">
        <div className="creator-studio-home-heading">
          <h1>创作项目</h1>
          <button className="creator-studio-new-project-button" type="button" onClick={() => setCreateDialogOpen(true)}><DshPlusIcon size={16} />新建项目</button>
        </div>
        <div className="creator-studio-project-toolbar">
          <label className="creator-studio-project-search">
            <MagnifyingGlass size={18} aria-hidden="true" />
            <input type="search" placeholder="搜索项目" aria-label="搜索项目" value={query} onChange={(event) => {
              setQuery(event.target.value);
              setCurrentPage(1);
            }} />
          </label>
          <div className="creator-studio-view-switch" role="group" aria-label="项目布局">
            <button className={viewMode === "list" ? "is-active" : ""} type="button" aria-label="列表视图" aria-pressed={viewMode === "list"} title="列表视图" onClick={() => setViewMode("list")}><ListBullets size={18} weight="bold" aria-hidden="true" /></button>
            <button className={viewMode === "grid" ? "is-active" : ""} type="button" aria-label="网格视图" aria-pressed={viewMode === "grid"} title="网格视图" onClick={() => setViewMode("grid")}><SquaresFour size={18} weight="fill" aria-hidden="true" /></button>
          </div>
        </div>
        {projects.length ? <p className="creator-studio-project-count">{filteredProjects.length} 个项目</p> : null}
        <section className="creator-studio-project-collection" data-view={viewMode} aria-label="项目列表">
          <ProjectCollection
            projects={visibleProjects}
            viewMode={viewMode}
            pendingDeletionId={pendingDeletionId}
            deletingProjectId={deletingProjectId}
            deleteError={deleteError}
            onOpenProject={onOpenProject}
            onRequestDelete={requestDelete}
            onCancelDelete={cancelDelete}
            onConfirmDelete={confirmDelete}
          />
        </section>
        {filteredProjects.length > 0 ? <CreatorStudioPagination
          pageSize={pageSize}
          currentPage={projectPage.currentPage}
          totalPages={totalPages}
          onPageSizeChange={changePageSize}
          onPageChange={changePage}
        /> : null}
      </div> : <LibraryPage page={activePage} />}
    </div>

    {createDialogOpen ? <CreateProjectDialog characters={characters} projectCatalog={projectCatalog} onClose={() => setCreateDialogOpen(false)} onCreated={() => {
      setActivePage("projects"); setCurrentPage(1); setCreateDialogOpen(false);
    }} /> : null}
  </div>;
}
