"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Mobile navigation for the public landing page. Replaces the three full-width
 * header buttons (which overflow below ~640px) with a hamburger + slide-in sheet.
 * Kept as a small client component so the rest of the landing page can stay
 * server-rendered.
 */
export function LandingMobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle className="font-bold tracking-tight">Math&amp;Maroc</SheetTitle>
        </SheetHeader>
        <nav className="mt-6 flex flex-col gap-2 px-4">
          <SheetClose asChild>
            <Button variant="ghost" className="justify-start" asChild>
              <Link href="/events">
                <Search className="mr-2 h-4 w-4" />
                Browse Events
              </Link>
            </Button>
          </SheetClose>
          <SheetClose asChild>
            <Button variant="outline" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </SheetClose>
          <SheetClose asChild>
            <Button asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </SheetClose>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
