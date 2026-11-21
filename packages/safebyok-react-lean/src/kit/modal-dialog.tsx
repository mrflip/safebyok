/** `ModalDialog`, a dialog shown as a modal for as long as it is mounted: the kit's unlock dialog, and a host's own. */

import type { ReactNode } from 'react'

// == [The dialog]: ModalDialog, showWhileMounted

/** A `<dialog>` shown as a modal while mounted, titled by the element `labelledBy` names. Escape calls `onCancel`, and leaves closing it to whoever mounted it. */
export function ModalDialog({ labelledBy, onCancel, children }: Readonly<{ labelledBy: string, onCancel: () => void, children: ReactNode }>) {
  // The browser would close the dialog on Escape by itself; prevented, so the one who mounted it decides.
  return (
    <dialog ref={showWhileMounted} className="sok-dialog" aria-labelledby={labelledBy} onCancel={(event) => { event.preventDefault(); onCancel() }}>
      {children}
    </dialog>
  )
}

// showModal focuses the dialog's first control, keeps Tab inside it, and makes the rest of the page inert.
/** Show `dialog` as a modal, and close it on unmount. */
function showWhileMounted(dialog: HTMLDialogElement) {
  dialog.showModal()
  return () => { dialog.close() }
}
// --
