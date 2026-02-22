export interface ApplicantProfileCompletionInput {
  fullName?: string | null;
  phone?: string | null;
  education?: string | null;
  institution?: string | null;
  city?: string | null;
  country?: string | null;
}

const REQUIRED_PROFILE_FIELDS = [
  { key: "fullName", label: "Full name" },
  { key: "phone", label: "Phone" },
  { key: "education", label: "Education level" },
  { key: "institution", label: "Institution" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
] as const;

type RequiredProfileKey = (typeof REQUIRED_PROFILE_FIELDS)[number]["key"];

function hasTextValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function getProfileCompletionStatus(
  profile: ApplicantProfileCompletionInput | null | undefined,
): {
  completeness: number;
  totalRequired: number;
  completedRequired: number;
  missingFields: string[];
  isComplete: boolean;
} {
  const target = profile ?? {};
  const missingFields = REQUIRED_PROFILE_FIELDS.filter(
    ({ key }) => !hasTextValue(target[key as RequiredProfileKey]),
  ).map((field) => field.label);
  const totalRequired = REQUIRED_PROFILE_FIELDS.length;
  const completedRequired = totalRequired - missingFields.length;
  const completeness = Math.round((completedRequired / totalRequired) * 100);

  return {
    completeness,
    totalRequired,
    completedRequired,
    missingFields,
    isComplete: missingFields.length === 0,
  };
}
