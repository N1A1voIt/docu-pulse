"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog } from "@base-ui/react/dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Folder01Icon,
  Home01Icon,
  Layout01Icon,
  Mail01Icon,
  PlusSignIcon,
  Search01Icon,
  Settings01Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons";

import { useActiveSpace, useSpaces } from "@/lib/spaces";
import { useCreateSpace } from "./create-space-dialog";

type IconElement = React.ComponentProps<typeof HugeiconsIcon>["icon"];

/**
 * One row in the palette. The `{ value, label }` shape is deliberate: Base UI's
 * autocomplete uses `label` as the string an item is filtered by, so no
 * `itemToStringValue` is needed.
 */
interface Command {
  value: string;
  label: string;
  icon: IconElement;
  hint?: string;
  /** Navigation rows are real links, so the palette can never dead-end. */
  href?: string;
  /** Non-navigation rows run an action instead. */
  action?: "create-space";
}

interface CommandGroup {
  value: string;
  items: Command[];
}

const ITEM_CLASS =
  "flex cursor-default items-center gap-2.5 rounded-xl px-3 py-2 text-sm outline-hidden select-none data-highlighted:bg-foreground/10";

/**
 * The ⌘K / Ctrl+K navigation palette. It reads only the data the shell already
 * loaded (`useSpaces` + `useActiveSpace`) — Home, every space, the active
 * space's sections, and create-team. There is no backend search and no
 * documents, so the palette can never promise a place that does not exist.
 */
export function CommandPalette() {
  const { spaces } = useSpaces();
  const { activeSpace } = useActiveSpace();
  const { open: openCreateSpace, isOpen: createSpaceOpen } = useCreateSpace();

  const [open, setOpen] = useState(false);
  const shortcutsId = useId();

  // ⌘K on macOS, Ctrl+K elsewhere. Registered on the window so it works from
  // any route inside the shell; toggling matches the platform convention. It
  // stands down while the create-team dialog is open so the two modals never
  // stack (where one Esc would close both).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (createSpaceOpen) return;
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createSpaceOpen]);

  const groups = useMemo<CommandGroup[]>(() => {
    const goTo: Command[] = [
      { value: "home", label: "Home", icon: Home01Icon, href: "/" },
      ...spaces.map<Command>((space) => ({
        value: `space:${space.id}`,
        label: space.name,
        icon: Folder01Icon,
        hint: space.isPersonal ? "Personal" : "Team",
        href: `/orgs/${space.id}`,
      })),
    ];

    const result: CommandGroup[] = [{ value: "Go to", items: goTo }];

    if (activeSpace) {
      result.push({
        value: "This space",
        items: [
          {
            value: `overview:${activeSpace.id}`,
            label: "Overview",
            icon: Layout01Icon,
            hint: "Page",
            href: `/orgs/${activeSpace.id}`,
          },
          {
            value: `members:${activeSpace.id}`,
            label: "Members",
            icon: UserMultiple02Icon,
            hint: "Page",
            href: `/orgs/${activeSpace.id}/members`,
          },
          {
            value: `invites:${activeSpace.id}`,
            label: "Invites",
            icon: Mail01Icon,
            hint: "Page",
            href: `/orgs/${activeSpace.id}/invites`,
          },
          {
            value: `settings:${activeSpace.id}`,
            label: "Settings",
            icon: Settings01Icon,
            hint: "Page",
            href: `/orgs/${activeSpace.id}/settings`,
          },
        ],
      });
    }

    result.push({
      value: "Actions",
      items: [
        {
          value: "create-space",
          label: "Create team space",
          icon: PlusSignIcon,
          hint: "Action",
          action: "create-space",
        },
      ],
    });

    return result;
  }, [spaces, activeSpace]);

  function handleSelect(command: Command) {
    setOpen(false);
    if (command.action === "create-space") {
      // A navigation row lets the Link do the work; an action row runs here.
      openCreateSpace();
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="Search spaces and actions"
        className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <HugeiconsIcon
          icon={Search01Icon}
          strokeWidth={2}
          className="size-3.5"
          aria-hidden="true"
        />
        <span className="hidden sm:inline">Search</span>
        <kbd className="font-sans">⌘K</kbd>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 pt-[12vh] pb-4">
          <Dialog.Popup
            className="relative flex max-h-[min(28rem,calc(100dvh-8rem))] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/5 outline-none transition-[translate,scale,opacity] duration-150 data-ending-style:-translate-y-2 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:-translate-y-2 data-starting-style:scale-95 data-starting-style:opacity-0"
            aria-label="Command palette"
          >
            <Autocomplete.Root
              open
              inline
              items={groups}
              autoHighlight="always"
              keepHighlight
            >
              <Autocomplete.InputGroup className="flex items-center gap-2 border-b px-3">
                <HugeiconsIcon
                  icon={Search01Icon}
                  strokeWidth={2}
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <Autocomplete.Input
                  className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="Search spaces and actions…"
                  aria-label="Search spaces and actions"
                  aria-describedby={shortcutsId}
                />
                <Dialog.Close
                  aria-label="Close command palette"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    strokeWidth={2}
                    className="size-4"
                    aria-hidden="true"
                  />
                </Dialog.Close>
              </Autocomplete.InputGroup>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
                <Autocomplete.Empty>
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No results found.
                  </p>
                </Autocomplete.Empty>
                <Autocomplete.List className="outline-none">
                  {(group: CommandGroup) => (
                    <Autocomplete.Group
                      key={group.value}
                      items={group.items}
                      className="not-last:mb-1"
                    >
                      <Autocomplete.GroupLabel className="px-3 py-1.5 text-xs text-muted-foreground select-none">
                        {group.value}
                      </Autocomplete.GroupLabel>
                      <Autocomplete.Collection>
                        {(command: Command) => (
                          <Autocomplete.Item
                            key={command.value}
                            value={command}
                            {...(command.href
                              ? { render: <Link href={command.href} /> }
                              : {})}
                            onClick={() => handleSelect(command)}
                            className={ITEM_CLASS}
                          >
                            <HugeiconsIcon
                              icon={command.icon}
                              strokeWidth={2}
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {command.label}
                            </span>
                            {command.hint && (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {command.hint}
                              </span>
                            )}
                          </Autocomplete.Item>
                        )}
                      </Autocomplete.Collection>
                    </Autocomplete.Group>
                  )}
                </Autocomplete.List>
              </div>

              <div
                id={shortcutsId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground"
              >
                <span className="flex items-center gap-1">
                  Navigate
                  <kbd className="font-sans">↑</kbd>
                  <kbd className="font-sans">↓</kbd>
                </span>
                <span className="flex items-center gap-1">
                  Activate
                  <kbd className="font-sans">Enter</kbd>
                </span>
                <span className="flex items-center gap-1">
                  Close
                  <kbd className="font-sans">Esc</kbd>
                </span>
              </div>
            </Autocomplete.Root>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
