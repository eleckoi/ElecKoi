import {
  BookOpen,
  ChartLineUp,
  Folder,
  Globe,
  ImageSquare,
  ListChecks,
  MagicWand,
  PlugsConnected,
  PuzzlePiece,
  TerminalWindow,
  TreeStructure,
  UsersThree,
} from '@phosphor-icons/react';

export const AGENT_TOOL_GROUP_ICONS = Object.freeze({
  'builtin:auto-illustration': ImageSquare,
  'builtin:creator': MagicWand,
  'builtin:variables': TreeStructure,
  'builtin:setting-library': BookOpen,
  'builtin:roleplay-workflow': ChartLineUp,
  'builtin:workflow': ListChecks,
  'builtin:workspace': TerminalWindow,
  'builtin:collaboration': UsersThree,
  'builtin:mcp-resources': Folder,
  'builtin:web': Globe,
  'builtin:plugin-discovery': PlugsConnected,
});

export function AgentToolGroupIcon({ groupId, size = 18, weight = 'fill', ...props }) {
  const Icon = AGENT_TOOL_GROUP_ICONS[groupId] || PuzzlePiece;
  return <Icon size={size} weight={weight} aria-hidden="true" data-tool-group-icon={groupId} {...props} />;
}
