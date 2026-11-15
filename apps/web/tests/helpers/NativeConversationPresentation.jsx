import { OfficialConversationContent, OfficialConversationWidthControls, OfficialConversationRoot } from '../../../../tests/helpers/officialTrajectory.js';
import { createNativeConversationPresentation } from './NativeConversationPresentationBase.jsx';
export const renderNativeConversationContent = createNativeConversationPresentation(OfficialConversationContent, OfficialConversationWidthControls, OfficialConversationRoot);
