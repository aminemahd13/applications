import { CertificateOperationsScreen } from "@/app/(staff)/staff/[eventId]/certificates/certificate-operations-screen";

interface Props {
  params: Promise<{ eventId: string }>;
}

export default async function CertificatesOperationsPage({ params }: Props) {
  const { eventId } = await params;

  return (
    <CertificateOperationsScreen
      eventId={eventId}
      basePath={`/staff/${eventId}/certificates`}
    />
  );
}
