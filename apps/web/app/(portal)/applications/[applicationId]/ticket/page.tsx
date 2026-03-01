"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  QrCode,
  RefreshCw,
  Printer,
  Calendar,
  MapPin,
  User,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageHeader, CardSkeleton } from "@/components/shared";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { usePlatformSettings } from "@/components/providers/platform-settings-provider";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

interface Ticket {
  id: string;
  qrToken: string;
  applicantName: string;
  applicantEmail: string;
  eventName: string;
  eventDate?: string;
  eventLocation?: string;
  status: string;
  checkedInAt?: string;
}

interface ProfileInfo {
  fullName?: string;
}

export default function TicketPage() {
  const params = useParams();
  const applicationId = params.applicationId as string;
  const { csrfToken, user } = useAuth();
  const { platformName } = usePlatformSettings();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [resolvedEventId, setResolvedEventId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Resolve eventId from the applications list
        const listRes = await apiClient<
          | { applications: Array<Record<string, unknown>> }
          | Array<Record<string, unknown>>
        >("/applications/me");
        const apps = Array.isArray(listRes)
          ? listRes
          : (listRes as any).applications ?? (listRes as any).data ?? [];
        const match = apps.find((a: any) => a.id === applicationId);
        const eventId = (match as any)?.eventId as string | undefined;
        if (!eventId) { setIsLoading(false); return; }
        setResolvedEventId(eventId);

        const profilePromise = apiClient<ProfileInfo>("/auth/me/profile").catch(
          () => null
        );
        const res = await apiClient<Record<string, unknown> | { data: Record<string, unknown> }>(
          `/events/${eventId}/applications/${applicationId}/ticket`
        ).catch(async () => {
          // If no ticket exists yet, try creating/reissuing it.
          try {
            return await apiClient<Record<string, unknown> | { data: Record<string, unknown> }>(
              `/events/${eventId}/applications/${applicationId}/confirm`,
              { method: "POST", csrfToken: csrfToken ?? undefined }
            );
          } catch {
            return null;
          }
        });
        const raw: any = res && typeof res === "object" && "data" in res ? (res as any).data : res;
        if (raw) {
          const profile = await profilePromise;
          const resolvedEmail =
            (typeof raw.applicantEmail === "string" && raw.applicantEmail) ||
            user?.email ||
            "";
          const nameCandidates = [
            raw.applicantName,
            (match as any)?.applicantName,
            (match as any)?.applicantFullName,
            profile?.fullName,
            user?.fullName,
          ].filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0
          );
          const normalizedEmail = resolvedEmail.trim().toLowerCase();
          const resolvedName =
            nameCandidates.find(
              (name) =>
                !normalizedEmail ||
                name.trim().toLowerCase() !== normalizedEmail
            ) ??
            nameCandidates[0] ??
            "Attendee";

          setTicket({
            id: raw.id ?? applicationId,
            qrToken: raw.qrToken ?? "",
            applicantName: resolvedName,
            applicantEmail: resolvedEmail,
            eventName: raw.eventName ?? (match as any)?.eventTitle ?? "",
            eventDate: raw.eventDate ?? (match as any)?.eventStartDate,
            eventLocation: raw.eventLocation ?? (match as any)?.eventLocation,
            status: raw.status ?? "CONFIRMED",
            checkedInAt: raw.checkedInAt,
          });
        }
      } catch {
        /* handled */
      } finally {
        setIsLoading(false);
      }
    })();
  }, [applicationId, user, csrfToken]);

  async function regenerate() {
    if (!resolvedEventId) return;
    setIsRegenerating(true);
    try {
      const res = await apiClient<Record<string, unknown> | { data: Record<string, unknown> }>(
        `/events/${resolvedEventId}/applications/${applicationId}/confirm`,
        { method: "POST", csrfToken: csrfToken ?? undefined }
      );
      const raw: any = res && typeof res === "object" && "data" in res ? (res as any).data : res;
      if (raw && ticket) {
        setTicket({ ...ticket, qrToken: raw.qrToken ?? ticket.qrToken });
      }
      toast.success("Ticket token regenerated");
    } catch {
      /* handled */
    } finally {
      setIsRegenerating(false);
    }
  }

  if (isLoading) return <CardSkeleton />;
  if (!ticket) {
    return (
      <div className="text-center py-16 space-y-3">
        <QrCode className="h-12 w-12 text-muted-foreground mx-auto" />
        <h2 className="text-xl font-bold">No ticket available</h2>
        <p className="text-muted-foreground">
          Your ticket will appear here after your confirmation step is approved.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6 print:space-y-0"
    >
      <PageHeader title="Event Ticket" className="print:hidden" />

      <div className="max-w-md mx-auto print:mx-0 print:max-w-none">
        <Card className="overflow-hidden print:shadow-none print:border-2">
          {/* Ticket header with gradient */}
          <div className="bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground text-center print:bg-white print:text-black print:from-white print:to-white print:border-b print:border-border">
            <p className="text-[0.65rem] uppercase tracking-[0.35em] opacity-80 print:opacity-100">
              {platformName || "Math&Maroc"}
            </p>
            <h2 className="font-bold text-lg mt-1">{ticket.eventName}</h2>

            <div className="flex items-center justify-center gap-4 mt-2 text-sm opacity-90">
              {ticket.eventDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(ticket.eventDate).toLocaleDateString()}
                </span>
              )}
              {ticket.eventLocation && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {ticket.eventLocation}
                </span>
              )}
            </div>
          </div>

          <CardContent className="p-6 space-y-6">
            {/* QR Code */}
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-xl border bg-white p-4">
                <QRCodeSVG
                  value={ticket.qrToken}
                  size={200}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Present this QR code at check-in
              </p>
            </div>

            <Separator />

            {/* Attendee info */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{ticket.applicantName}</p>
                  <p className="text-xs text-muted-foreground">
                    {ticket.applicantEmail}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <QrCode className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Ticket ID</p>
                  <p className="text-sm font-mono">{ticket.id.slice(0, 12)}...</p>
                </div>
              </div>

              {ticket.checkedInAt ? (
                <Badge variant="outline" className="text-success border-success/30">
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  Checked in {new Date(ticket.checkedInAt).toLocaleString()}
                </Badge>
              ) : (
                <Badge variant="secondary">Not yet checked in</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-2 print:hidden">
        <Button variant="outline" className="flex-1" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" />
          Print
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={regenerate}
          disabled={isRegenerating}
        >
          {isRegenerating ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-4 w-4" />
          )}
          Regenerate Token
        </Button>
      </div>
    </motion.div>
  );
}
