import { CertificateStudioScreen } from "@/app/(staff)/staff/[eventId]/certificates/certificate-studio-screen";

interface Props {
  params: Promise<{ eventId: string }>;
}

export default async function AdminCertificatesStudioPage({ params }: Props) {
  const { eventId } = await params;

  return (
    <CertificateStudioScreen
      eventId={eventId}
      basePath={`/admin/events/${eventId}/certificates`}
    />
  );
}
