import { Link } from "react-router-dom"
import { ArrowRight } from "@phosphor-icons/react"

import { Button } from "@workspace/ui/components/button"
import { Page, PageHeader, Surface } from "@/features/shell/page.tsx"

export function PlaceholderPage({
  title,
  description,
  primaryHref,
  primaryLabel,
}: {
  title: string
  description: string
  primaryHref?: string
  primaryLabel?: string
}) {
  return (
    <Page className="max-w-3xl">
      <PageHeader
        title={title}
        description={description}
        actions={
          primaryHref && primaryLabel ? (
            <Button asChild>
              <Link to={primaryHref}>
                {primaryLabel}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : undefined
        }
      />
      <Surface className="p-6">
        <p className="text-sm leading-6 text-muted-foreground">
          This route is kept in the navigation map, but the production flow is not live
          yet.
        </p>
      </Surface>
    </Page>
  )
}
