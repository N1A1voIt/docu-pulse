"use client"

import * as React from "react"
import { Dialog as ModalPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

interface ModalProps {
  open: boolean
  /** Called when the dialog wants to open or close (Esc, backdrop, close button). */
  onOpenChange: (open: boolean) => void
  /** Wired by Base UI as the dialog's accessible name (rendered as a heading). */
  title: string
  description?: string
  /** Element to focus when the dialog opens (e.g. its first field). */
  initialFocus?: React.RefObject<HTMLElement | null>
  children: React.ReactNode
  className?: string
}

/**
 * A centered modal dialog built on Base UI's Dialog primitive. That primitive
 * supplies the focus trap, Esc-to-close, backdrop dismissal, page-scroll lock
 * and focus restore; the earlier hand-rolled dialogs had none of these.
 * Shared by the create-team and invite dialogs so both behave the same.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  initialFocus,
  children,
  className,
}: ModalProps) {
  return (
    <ModalPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <ModalPrimitive.Portal>
        <ModalPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <ModalPrimitive.Popup
          initialFocus={initialFocus}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 text-sm text-foreground shadow-lg ring-1 ring-foreground/5 outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
            className
          )}
        >
          <ModalPrimitive.Title className="font-heading text-lg font-semibold">
            {title}
          </ModalPrimitive.Title>
          {description && (
            <ModalPrimitive.Description className="mt-1 text-sm text-muted-foreground">
              {description}
            </ModalPrimitive.Description>
          )}
          <ModalPrimitive.Close
            render={
              <Button
                variant="ghost"
                className="absolute top-4 right-4"
                size="icon-sm"
              />
            }
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            <span className="sr-only">Close</span>
          </ModalPrimitive.Close>
          <div className="mt-4">{children}</div>
        </ModalPrimitive.Popup>
      </ModalPrimitive.Portal>
    </ModalPrimitive.Root>
  )
}
