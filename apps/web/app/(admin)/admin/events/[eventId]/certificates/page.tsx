import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ eventId: string }>;
}

export default async function AdminCertificatesPage({ params }: Props) {
  const { eventId } = await params;
  redirect(`/admin/events/${eventId}/certificates/studio`);
}
