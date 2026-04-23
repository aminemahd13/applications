import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ eventId: string }>;
}

export default async function CertificatesPage({ params }: Props) {
  const { eventId } = await params;
  redirect(`/staff/${eventId}/certificates/studio`);
}
