"use client";

import { CertificatesSectionShell } from "./certificates-section-shell";
import { CertificateOperationsWorkspace } from "./operations/workspace";

interface CertificateOperationsScreenProps {
  eventId: string;
  basePath: string;
}

export function CertificateOperationsScreen(props: CertificateOperationsScreenProps) {
  const { eventId, basePath } = props;

  return (
    <CertificatesSectionShell
      activeTab="operations"
      basePath={basePath}
      description="Issue, release, and monitor certificates."
    >
      <CertificateOperationsWorkspace eventId={eventId} />
    </CertificatesSectionShell>
  );
}
