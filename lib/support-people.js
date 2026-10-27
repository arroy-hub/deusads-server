// The faces in a conversation: for each author, the same card the profile page shows under "How someone sees you"
// (picture or initials, name, role and country). Never includes an email address or anything private.

import { avatarUrlOf } from "./account-data.js";
import { countryOptions, initials } from "./account-rules.js";
import { isSchemaOutdated } from "./api.js";

const ROLE = { advertiser: "Advertiser", developer: "Developer", admin: "DeusADS team" };

/** One card from an accounts row (the 0030 columns may be missing). */
export function personCard(row, { avatarUrl = null, countries = [] } = {}) {
  const name = String(row.company || row.contact_name || "").trim() || (row.role === "admin" ? "DeusADS team" : "");
  const country = countries.find((item) => item.code === row.country)?.name ?? "";
  return {
    id: row.id,
    name,
    role: ROLE[row.role] ?? "",
    country,
    avatarUrl,
    initials: initials({ company: row.company, contact_name: row.contact_name, email: row.email }),
  };
}

/** Cards for some accounts, keyed by id. An unknown id is simply missing. */
export async function loadPeople(service, ids) {
  const wanted = [...new Set((ids ?? []).filter(Boolean))];
  if (!wanted.length) return {};
  let { data, error } = await service.from("accounts").select("id, email, company, role, contact_name, avatar_path, country").in("id", wanted);
  if (error && isSchemaOutdated(error)) ({ data, error } = await service.from("accounts").select("id, email, company, role").in("id", wanted));
  if (error) return {};
  const countries = countryOptions();
  const out = {};
  for (const row of data ?? []) out[row.id] = personCard(row, { avatarUrl: avatarUrlOf(service, row.avatar_path), countries });
  return out;
}
