import {
  IconCopyOutlineRegular,
  IconTrashOutlineRegular,
  IconEditOutlineRegular,
  IconPlusOutlineRegular,
  IconSearchOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
  IconChevronUpOutlineRegular,
  IconEllipsisOutlineRegular,
  IconCloseOutlineRegular,
  IconDatabaseOutlineRegular,
  IconSlidersTwoOutlineRegular,
  IconLinkOutlineRegular,
  IconPinOutlineRegular,
  IconDownloadOutlineRegular,
  IconRefreshOutlineRegular,
  IconGlobeOutlineRegular,
  IconSettingsOutlineRegular,
  IconUsersOutlineRegular,
  IconPlayOutlineRegular,
  IconCodeOutlineRegular,
  IconBrowseOutlineRegular,
  IconFolderCloseRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';

export * from '@phosphor-icons/react';

// Preserve caller sizing while sharing the official regular artwork and currentColor.
function interfaceIcon(Icon) {
  return function InterfaceIcon({ size = 16, className }) {
    return <Icon size={size} className={className} />;
  };
}

export const Copy = interfaceIcon(IconCopyOutlineRegular);
export const Trash = interfaceIcon(IconTrashOutlineRegular);
export const PencilSimple = interfaceIcon(IconEditOutlineRegular);
export const NotePencil = interfaceIcon(IconEditOutlineRegular);
export const Plus = interfaceIcon(IconPlusOutlineRegular);
export const MagnifyingGlass = interfaceIcon(IconSearchOutlineRegular);
export const CaretDown = interfaceIcon(IconChevronDownOutlineRegular);
export const CaretLeft = interfaceIcon(IconChevronLeftOutlineRegular);
export const CaretRight = interfaceIcon(IconChevronRightOutlineRegular);
export const CaretUp = interfaceIcon(IconChevronUpOutlineRegular);
export const DotsThree = interfaceIcon(IconEllipsisOutlineRegular);
export const X = interfaceIcon(IconCloseOutlineRegular);
export const Database = interfaceIcon(IconDatabaseOutlineRegular);
export const SlidersHorizontal = interfaceIcon(IconSlidersTwoOutlineRegular);
export const LinkSimple = interfaceIcon(IconLinkOutlineRegular);
export const PushPin = interfaceIcon(IconPinOutlineRegular);
export const DownloadSimple = interfaceIcon(IconDownloadOutlineRegular);
export const ArrowClockwise = interfaceIcon(IconRefreshOutlineRegular);
export const Globe = interfaceIcon(IconGlobeOutlineRegular);
export const GearSix = interfaceIcon(IconSettingsOutlineRegular);
export const UsersThree = interfaceIcon(IconUsersOutlineRegular);
export const Play = interfaceIcon(IconPlayOutlineRegular);
export const FileCode = interfaceIcon(IconCodeOutlineRegular);
export const Browse = interfaceIcon(IconBrowseOutlineRegular);
export const FolderSimple = interfaceIcon(IconFolderCloseRegular);
