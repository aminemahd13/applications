"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

export type Crumb = {
  label: string;
  href?: string;
  translateLabel?: boolean;
};

type Entry = {
  pathname: string;
  crumbs: Crumb[];
};

type Ctx = {
  entry: Entry | null;
  setEntry: (next: Entry) => void;
};

const BreadcrumbsContext = createContext<Ctx | null>(null);

export function BreadcrumbsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [entry, setEntryState] = useState<Entry | null>(null);

  const setEntry = useCallback((next: Entry) => {
    setEntryState(next);
  }, []);

  const value = useMemo(() => ({ entry, setEntry }), [entry, setEntry]);

  return (
    <BreadcrumbsContext.Provider value={value}>
      {children}
    </BreadcrumbsContext.Provider>
  );
}

export function useBreadcrumbs(): Crumb[] {
  const ctx = useContext(BreadcrumbsContext);
  const pathname = usePathname();
  // Gate on pathname so stale crumbs from the previous page never bleed through
  // before the new page calls useSetBreadcrumbs.
  if (!ctx?.entry || ctx.entry.pathname !== pathname) return [];
  return ctx.entry.crumbs;
}

export function useSetBreadcrumbs(crumbs: Crumb[]): void {
  const ctx = useContext(BreadcrumbsContext);
  const setEntry = ctx?.setEntry;
  const pathname = usePathname();
  const serialized = JSON.stringify(crumbs);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!setEntry) return;
    const key = `${pathname}::${serialized}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    setEntry({ pathname, crumbs });
  }, [pathname, serialized, setEntry, crumbs]);
}
