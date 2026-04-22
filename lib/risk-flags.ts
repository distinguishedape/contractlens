import { type ExtractedContract } from "./schema";

export type RiskLevel = "red" | "yellow" | "green";

export type RiskFlag = {
  level: RiskLevel;
  field: string;
  message: string;
};

/**
 * Rule-based risk flag evaluation.
 *
 * Runs against the extracted contract data and returns one flag per
 * triggered rule. If no rules fire, returns a single GREEN flag.
 *
 * Rules (from spec):
 *  RED   – auto_renewal is on AND renewal notice deadline is within 30 days
 *  RED   – termination_conditions is empty
 *  YELLOW – rent escalation is percentage AND value > 10
 *  YELLOW – ambiguities.length >= 3
 *  YELLOW – extraction_confidence is "low"
 *  GREEN  – none of the above triggered
 */
export function computeRiskFlags(
  data: ExtractedContract,
  today: Date = new Date()
): RiskFlag[] {
  const flags: RiskFlag[] = [];

  // RED: auto-renewal trap — enabled and deadline is within 30 days
  if (data.auto_renewal.enabled) {
    const deadline = data.dates.renewal_notice_deadline;
    if (deadline !== null) {
      const deadlineDate = new Date(deadline);
      const msUntilDeadline = deadlineDate.getTime() - today.getTime();
      const daysUntilDeadline = msUntilDeadline / (1000 * 60 * 60 * 24);
      if (daysUntilDeadline >= 0 && daysUntilDeadline <= 30) {
        flags.push({
          level: "red",
          field: "auto_renewal",
          message: `Auto-renewal notice deadline is in ${Math.ceil(daysUntilDeadline)} day(s) (${deadline}). You must act now to avoid automatic renewal.`,
        });
      }
    } else {
      // Auto-renewal is on but no deadline date was extracted — flag it
      // as yellow so reviewers know they need to find the deadline.
      flags.push({
        level: "yellow",
        field: "auto_renewal",
        message:
          "Auto-renewal is enabled but no renewal notice deadline was found. Verify the notice deadline manually.",
      });
    }
  }

  // RED: no termination conditions — potentially traps the tenant
  if (data.termination_conditions.length === 0) {
    flags.push({
      level: "red",
      field: "termination_conditions",
      message:
        "No termination conditions were found. The contract may not specify grounds for early exit.",
    });
  }

  // YELLOW: high escalation rate
  if (
    data.financial_terms.rent_escalation.type === "percentage" &&
    data.financial_terms.rent_escalation.value !== null &&
    data.financial_terms.rent_escalation.value > 10
  ) {
    flags.push({
      level: "yellow",
      field: "financial_terms.rent_escalation",
      message: `Rent escalation is ${data.financial_terms.rent_escalation.value}% per renewal — above the typical 10% threshold.`,
    });
  }

  // YELLOW: many ambiguities indicate a complex or poorly-drafted contract
  if (data.ambiguities.length >= 3) {
    flags.push({
      level: "yellow",
      field: "ambiguities",
      message: `${data.ambiguities.length} ambiguous clause(s) flagged by the model. Review the "Flags for Review" section.`,
    });
  }

  // YELLOW: low extraction confidence
  if (data.extraction_confidence === "low") {
    flags.push({
      level: "yellow",
      field: "extraction_confidence",
      message:
        "Extraction confidence is low. The document may be poorly formatted, scanned, or non-standard. Manually verify all fields.",
    });
  }

  // GREEN: no issues found
  if (flags.length === 0) {
    flags.push({
      level: "green",
      field: "overall",
      message: "No risk flags detected.",
    });
  }

  return flags;
}

/** Returns the highest severity level among a set of flags. */
export function topRiskLevel(flags: RiskFlag[]): RiskLevel {
  if (flags.some((f) => f.level === "red")) return "red";
  if (flags.some((f) => f.level === "yellow")) return "yellow";
  return "green";
}
