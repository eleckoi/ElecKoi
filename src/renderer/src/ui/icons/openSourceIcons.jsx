import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Browsers,
  ChatText,
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
} from "@phosphor-icons/react";

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
export function ChatHistoryIcon(props) { return phosphor(ChatText, props); }
export function ImportIcon(props) { return phosphor(DownloadSimple, { size: 16, ...props }); }
export function ExportIcon(props) { return phosphor(UploadSimple, { size: 16, ...props }); }
export function MinusIcon(props) { return phosphor(Minus, props); }
export function PlusIcon(props) { return phosphor(Plus, props); }
export function ResetIcon(props) { return phosphor(ArrowCounterClockwise, props); }
