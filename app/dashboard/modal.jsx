"use client";

import { useId, useLayoutEffect, useRef } from "react";

/**
 * A pop-up over the page (the browser's own modal dialog: dims the page, keeps focus inside, closes
 * on Escape). `open` is owned by the caller; `onClose` is called however the pop-up closes. The
 * content is only built while it is open, so a closed pop-up costs nothing and forgets what was
 * typed in it.
 */
export default function Modal({ open, onClose, title, children, footer, busy = false }) {
  const ref = useRef(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      {open && (
        <div className="modal-box">
          <div className="modal-head">
            <h2 id={titleId}>{title}</h2>
            <button className="modal-close" type="button" aria-label="Close" onClick={onClose} disabled={busy}>
              ×
            </button>
          </div>
          <div className="modal-body stack">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
