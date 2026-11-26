export { groupRoleplayReplyBlocks, roleplayGroupText } from '@shared/foundation/roleplayReplyGroups';

export function messageRoleplayBlocks(message) {
  return message.id === 'opening'
    ? message.openingOptions?.find(option => option.id === message.selectedOpeningId)?.segments
    : message.roleplayBlocks;
}
