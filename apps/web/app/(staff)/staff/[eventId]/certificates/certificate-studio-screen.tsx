"use client";

import { CertificatesSectionShell } from "./certificates-section-shell";
import { CertificateStudioWorkspace } from "./studio/workspace";

interface CertificateStudioScreenProps {
  eventId: string;
  basePath: string;
}

export function CertificateStudioScreen(props: CertificateStudioScreenProps) {
  const { eventId, basePath } = props;

  return (
    <CertificatesSectionShell
      activeTab="studio"
      basePath={basePath}
      description="Design, preview, and publish certificate templates."
    >
      <CertificateStudioWorkspace eventId={eventId} />
    </CertificatesSectionShell>
  );
}
