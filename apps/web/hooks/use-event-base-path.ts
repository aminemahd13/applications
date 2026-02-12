"use client";

import { usePathname, useParams } from "next/navigation";

/**
 * Returns the correct base path for event management pages depending on
 * whether the user is in the admin area (`/admin/events/:eventId`) or
 * the staff area (`/staff/:eventId`).
 */
export function useEventBasePath(): string {
  const pathname = usePathname();
  const params = useParams();
  const eventId = params.eventId as string;

  if (pathname.startsWith("/admin/events/")) {
    return `/admin/events/${eventId}`;
  }
  return `/staff/${eventId}`;
}
