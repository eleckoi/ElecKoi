/** Channels available only to the isolated update-dialog document. */
export const UPDATE_DIALOG_IPC = { status: 'dsh-update-dialog:status', changed: 'dsh-update-dialog:changed', respond: 'dsh-update-dialog:respond' } as const

/** Text and choices supplied by the main process, never by product documents. */
export interface UpdateDialogView {
  /** Identifies the displayed choices; a response from an older prompt is rejected. */
  readonly revision: number
  readonly locale: string
  readonly title: string
  readonly message: string
  readonly detail: string
  readonly buttons: readonly string[]
  readonly cancelId: number
  readonly closeLabel: string
  readonly technicalDetails: string
  readonly technicalDetailsLabel: string
}

/** The document can select only a displayed response index. */
export interface UpdateDialogApi {
  status(): Promise<UpdateDialogView | null>
  respond(revision: number, index: number): Promise<void>
  subscribe(listener: (view: UpdateDialogView | null) => void): () => void
}
