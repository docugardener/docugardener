// SPDX-License-Identifier: AGPL-3.0-or-later
import { DocsLayout } from "@/components/docs/DocsLayout"

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DocsLayout>{children}</DocsLayout>
}
