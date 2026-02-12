import { getFormFields } from "@event-platform/schemas";

export function getRequiredFieldKeySet(formDefinition: unknown): Set<string> {
  try {
    const fields = getFormFields(formDefinition);
    const requiredKeys = new Set<string>();

    for (const field of fields) {
      if (field.validation?.required === true) {
        requiredKeys.add(field.key || field.id);
      }
    }

    return requiredKeys;
  } catch {
    return new Set<string>();
  }
}
