import { bookingsMissing } from "./booking-rules";

/**
 * The rows of public.schema_versions as read with the service client, or null when
 * the table does not exist yet (migration 0012 not run). Any other failure also
 * gives null: the caller then reports "cannot tell", never "all applied".
 */
export async function loadAppliedVersions(service) {
  const { data, error } = await service.from("schema_versions").select("version, name, applied_at").order("version");
  if (error) {
    if (!bookingsMissing(error)) console.error("[DeusADS] schema_versions read failed:", error.code, error.message);
    return null;
  }
  return data ?? [];
}
