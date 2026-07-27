"use client"

import * as React from "react"
import type { VariantProps } from "class-variance-authority"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * A confirmation step for destructive actions, built on the existing
 * `Dialog` primitive rather than pulling in Radix's `AlertDialog` — the two
 * would render two visually different modals for no benefit, and everything
 * `AlertDialog` adds over `Dialog` here (a title, a description, a focused
 * cancel) is spelled out below.
 *
 * It owns the pending state of the confirm handler. `onConfirm` may be
 * async: the dialog disables both buttons while it runs and closes itself
 * only after it resolves, so a slow server action can't be double-submitted
 * by an impatient second click, and a failed one leaves the dialog open with
 * the error toast visible behind it.
 *
 * `onConfirm` rejecting is NOT treated as an error to swallow — it closes
 * nothing and re-enables the buttons. Callers that return a `Result` should
 * surface `result.error` themselves (via `toast.error`) and simply not throw.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
}) {
  const [pending, setPending] = React.useState(false)

  async function handleConfirm() {
    setPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      // Runs even if `onConfirm` threw, so a failed delete leaves a usable
      // dialog rather than one stuck behind disabled buttons.
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      // While the action is in flight the dialog refuses to close — Escape,
      // the overlay and the X all go through `onOpenChange`. Without this,
      // dismissing mid-flight would leave the mutation running with no
      // feedback attached to anything.
      onOpenChange={(next) => {
        if (pending) return
        onOpenChange(next)
      }}
    >
      <DialogContent size="sm" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div>{description}</div>
          </DialogDescription>
        </DialogHeader>
        {/* Empty body keeps the header/footer spacing consistent with every
            other dialog in the app; the description carries the content. */}
        <DialogBody className="py-0" />
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => void handleConfirm()}
          >
            {pending ? "Eliminando…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The shape almost every call site actually wants: a destructive button that
 * opens `ConfirmDialog` and runs `onConfirm` only if the user confirms.
 *
 * It exists so that adding a confirmation step to an existing delete button
 * is a one-line swap (`Button` -> `ConfirmDeleteButton`) instead of threading
 * `open`/`onOpenChange` state through every component that happens to delete
 * something. Components that need the dialog driven by something other than
 * a button — a dropdown item, a keyboard shortcut — should use
 * `ConfirmDialog` directly.
 *
 * `children` is the BUTTON's label; `title`/`description` are the dialog's.
 */
export function ConfirmDeleteButton({
  title,
  description,
  confirmLabel,
  onConfirm,
  children,
  variant = "destructive",
  size = "sm",
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  title: string
  description: React.ReactNode
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
  children: React.ReactNode
  disabled?: boolean
  className?: string
  "aria-label"?: string
} & VariantProps<typeof buttonVariants>) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        className={className}
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        onConfirm={onConfirm}
      />
    </>
  )
}
