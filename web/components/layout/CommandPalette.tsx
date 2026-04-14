"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from "@/components/ui/command"
import { LayoutGrid, Settings, MessageSquare, FlaskConical, Building2, Inbox } from "lucide-react"

export function CommandPalette() {
    const [open, setOpen] = React.useState(false)
    const router = useRouter()

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((open) => !open)
            }
        }

        document.addEventListener("keydown", down)
        return () => document.removeEventListener("keydown", down)
    }, [])

    const runCommand = React.useCallback((command: () => unknown) => {
        setOpen(false)
        command()
    }, [])

    return (
        <CommandDialog open={open} onOpenChange={setOpen}>
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup heading="Navigation">
                    <CommandItem onSelect={() => runCommand(() => router.push("/dashboard"))}>
                        <LayoutGrid className="mr-2 h-4 w-4" />
                        <span>Dashboard</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => router.push("/dashboard/inbox"))}>
                        <Inbox className="mr-2 h-4 w-4" />
                        <span>Triage Inbox</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => router.push("/dashboard/components"))}>
                        <Building2 className="mr-2 h-4 w-4" />
                        <span>Components</span>
                    </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Settings">
                    <CommandItem onSelect={() => runCommand(() => router.push("/dashboard/settings"))}>
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Settings</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => router.push("/dashboard/prompts"))}>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        <span>Prompt Engineering</span>
                    </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Tools">
                    <CommandItem onSelect={() => runCommand(() => router.push("/dashboard/simulation"))}>
                        <FlaskConical className="mr-2 h-4 w-4" />
                        <span>Simulator</span>
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    )
}
