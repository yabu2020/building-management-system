/**
 * The "Add Building" form stores Branch and District together in a single
 * free-text field (Building.branchName), using the enforced format:
 *   "Branch Name (District Name)"
 * e.g. "Bole Branch (Addis Ababa District)"
 *
 * Rather than adding a new District column/field (which would mean changing
 * the Add Building form and re-entering data for every existing building),
 * these helpers parse the District straight out of the existing branchName
 * value. This is purely a read-side utility used by reporting — it does not
 * change how buildings are created or stored.
 */

export interface ParsedBranchDistrict {
  /** The raw, unmodified value as stored on the building (branchName). */
  raw: string;
  /** Branch name only, e.g. "Bole Branch". */
  branch: string;
  /** District name only, e.g. "Addis Ababa District". */
  district: string;
}

// Tolerant regex matching "(District Name)" at the end of the branch text
const BRANCH_DISTRICT_PARSE_REGEX = /^(.*?)\s*\(\s*([^()]+)\s*\)\s*$/;

/** Fallback label used when a branchName does not match the expected format
 * (e.g. legacy/free-text data entered before the format was enforced). */
export const UNKNOWN_DISTRICT_LABEL = "Unspecified District";

/**
 * Parses a Building.branchName value into its Branch and District parts.
 * Never throws — falls back gracefully for legacy or malformed values so
 * reporting still runs on the full dataset.
 */
export function parseBranchDistrict(
  branchName: string | null | undefined,
): ParsedBranchDistrict {
  const raw = (branchName ?? "").trim();

  if (!raw) {
    return {
      raw: "",
      branch: "Unspecified Branch",
      district: UNKNOWN_DISTRICT_LABEL,
    };
  }

  const match = raw.match(BRANCH_DISTRICT_PARSE_REGEX);
  if (match) {
    const branch = match[1].trim();
    const district = match[2].trim();
    if (branch && district) {
      return { raw, branch, district };
    }
  }

  return {
    raw,
    branch: raw,
    district: UNKNOWN_DISTRICT_LABEL,
  };
}

/** Convenience helper returning just the District name. */
export function getDistrictFromBranchName(
  branchName: string | null | undefined,
): string {
  return parseBranchDistrict(branchName).district;
}