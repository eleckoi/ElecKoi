/** Reuse the original project/parser types; these imports emit no runtime code. */
export type {
  FrontendScope, FrontendJson, FrontendBinding, FrontendManifest, FrontendProject,
  FrontendWorkspace, FrontendFileInput, FrontendChange,
} from '@eleckoi/dsh-product-api';
import type { FrontendBinding, FrontendManifest } from '@eleckoi/dsh-product-api';

/** The parser requires pageId/slot for these targets; extension fields remain open. */
export type FrontendRootBinding = FrontendBinding & { target: 'root' };
export type FrontendPageBinding = FrontendBinding & { target: 'page'; pageId: string };
export type FrontendSlotBinding = FrontendBinding & { target: 'slot'; slot: string };
export type ApplicationFrontendManifest = FrontendManifest & { scope: 'application' };

/** Only these scalar owner keys are forwarded by ApplicationFrontendController. */
export interface FrontendOwner {
  characterId?: string | number | boolean | null;
  conversationId?: string | number | boolean | null;
  projectId?: string | number | boolean | null;
  section?: string | number | boolean | null;
  pageId?: string | number | boolean | null;
  messageId?: string | number | boolean | null;
  presetId?: string | number | boolean | null;
}

/** Application root/page/slot author document context; container arrives on measurement. */
export interface FrontendContext {
  [key: string]: unknown;
  binding: FrontendBinding;
  view: string;
  preview: boolean;
  owner?: FrontendOwner;
  container?: { width: number; height: number };
}

declare global {
  interface Window {
    /** Absent outside an authored document; null for documents without application context. */
    ElecKoiFrontendContext?: FrontendContext | null;
  }
  interface WindowEventMap {
    'eleckoi:frontend-context': CustomEvent<FrontendContext>;
  }
}
