"use client";

import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type FeedbackState = "idle" | "loading" | "success";

function isHashHref(href: string): boolean {
  return href.startsWith("#");
}

export function FeedbackLink({
  href,
  className,
  target,
  rel,
  children,
}: {
  href: string;
  className?: string;
  target?: string;
  rel?: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<FeedbackState>("idle");
  const loadingTimerRef = useRef<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (loadingTimerRef.current !== null) {
        window.clearTimeout(loadingTimerRef.current);
      }
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (loadingTimerRef.current !== null) {
      window.clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    setState("loading");

    if (isHashHref(href)) {
      event.preventDefault();
      loadingTimerRef.current = window.setTimeout(() => {
        setState("success");
        if (href.length > 1) {
          const anchorTarget = document.querySelector(href);
          if (anchorTarget instanceof HTMLElement) {
            anchorTarget.scrollIntoView({ behavior: "smooth", block: "start" });
          }
          window.history.replaceState(null, "", href);
        }
        resetTimerRef.current = window.setTimeout(() => {
          setState("idle");
        }, 900);
      }, 320);
      return;
    }

    loadingTimerRef.current = window.setTimeout(() => {
      setState("success");
      resetTimerRef.current = window.setTimeout(() => {
        setState("idle");
      }, 900);
    }, 320);
  };

  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      onClick={handleClick}
      className={cn("mm-feedback-link", className)}
      data-cta-state={state}
      aria-busy={state === "loading"}
    >
      {children}
      <span
        className={cn(
          "mm-feedback-badge",
          state === "idle" ? "opacity-0" : "opacity-100",
        )}
        aria-hidden="true"
      >
        {state === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
      </span>
    </Link>
  );
}

