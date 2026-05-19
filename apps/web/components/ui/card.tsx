import * as React from "react"

import { cn } from "@/lib/utils"

type CardVariant = "default" | "marketing"

function Card({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: CardVariant }) {
  return (
    <div
      data-slot="card"
      data-variant={variant}
      className={cn(
        "bg-card text-card-foreground flex min-w-0 flex-col rounded-xl border shadow-sm",
        variant === "default" && "gap-6 py-6",
        // Marketing: larger radius, generous padding, editorial shadow. The
        // child padding bumps cascade via [data-slot] selectors so callers
        // don't have to retag every CardHeader/Content/Footer.
        variant === "marketing" &&
          "gap-8 rounded-2xl py-10 shadow-editorial md:py-12 " +
            "[&_[data-slot=card-header]]:px-8 md:[&_[data-slot=card-header]]:px-10 " +
            "[&_[data-slot=card-content]]:px-8 md:[&_[data-slot=card-content]]:px-10 " +
            "[&_[data-slot=card-footer]]:px-8 md:[&_[data-slot=card-footer]]:px-10",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid min-w-0 auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("min-w-0 font-semibold leading-tight break-words [overflow-wrap:anywhere]", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground min-w-0 text-sm break-words [overflow-wrap:anywhere]", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("min-w-0 px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex min-w-0 items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
