import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Browsers,
  DownloadSimple,
  GearSix,
  ImageSquare,
  List,
  Minus,
  Palette,
  Plug,
  Prohibit,
  Plus,
  PushPin,
  Robot,
  UserCircle,
  UserCircleGear,
  UploadSimple,
} from "./interfaceIcons.jsx";
import { IconQueueOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

function phosphor(Icon, { size = 24, weight = "regular", ...props } = {}) {
  return <Icon size={size} weight={weight} aria-hidden="true" {...props} />;
}

export function PlugIcon(props) { return phosphor(Plug, props); }
export function PinIcon(props) { return phosphor(PushPin, props); }
export function WindowIcon(props) { return phosphor(Browsers, props); }
export function MenuIcon(props) { return phosphor(List, props); }
export function SettingsIcon(props) { return phosphor(GearSix, props); }
export function BotIcon(props) { return phosphor(Robot, props); }
export function PaletteIcon(props) { return phosphor(Palette, props); }
export function PictureFrameIcon(props) { return phosphor(ImageSquare, props); }
export function RestoreDefaultIcon(props) { return phosphor(Prohibit, props); }
export function RotateLeftIcon(props) { return phosphor(ArrowCounterClockwise, props); }
export function RotateRightIcon(props) { return phosphor(ArrowClockwise, props); }
export function CharacterManagerIcon(props) { return phosphor(UserCircleGear, props); }
export function DefaultCharacterAvatarIcon(props) { return phosphor(UserCircle, { size: 64, ...props }); }
export function ChatHistoryIcon({ size = 24, className }) { return <IconQueueOutlineRegular size={size} className={className} />; }
export function ImportIcon(props) { return phosphor(DownloadSimple, { size: 16, ...props }); }
export function ExportIcon(props) { return phosphor(UploadSimple, { size: 16, ...props }); }
function historyFileIcon(paths, props = {}) {
  return <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {paths.map((path) => <path key={path} d={path} />)}
  </svg>;
}
export function HistoryImportIcon(props) { return historyFileIcon([
  "M5.9 13.2V5.4a1.6 1.6 0 0 1 1.6-1.6h6.2l4.4 4.4v10.4a1.6 1.6 0 0 1-1.6 1.6h-4.6",
  "M13.7 3.8v4.4h4.4", "M2.9 16h6.5", "M6.4 13 9.4 16l-3 3",
], props); }
export function HistoryExportIcon(props) { return historyFileIcon([
  "M18.1 13.2V8.2L13.7 3.8H7.5A1.6 1.6 0 0 0 5.9 5.4v13a1.6 1.6 0 0 0 1.6 1.6h5.2",
  "M13.7 3.8v4.4h4.4", "M14.6 16h6.5", "M18.1 13 21.1 16l-3 3",
], props); }
export function MinusIcon(props) { return phosphor(Minus, props); }
export function PlusIcon(props) { return phosphor(Plus, props); }
export function ResetIcon(props) { return phosphor(ArrowCounterClockwise, props); }
