import type { ReportClassification } from "@/types/database";

export type ClassificationLabel =
  | "Real Emergency"
  | "Irrelevant"
  | "Rumor / Unverified"
  | "General Question";

export interface ClassificationResult {
  classification: ReportClassification;
  classification_label: ClassificationLabel;
  confidence: number;
  filter_reason: string | null;
}

const CLASSIFICATION_LABELS: Record<ReportClassification, ClassificationLabel> = {
  real_emergency: "Real Emergency",
  irrelevant: "Irrelevant",
  rumor_unverified: "Rumor / Unverified",
  general_question: "General Question",
};

export function toClassificationLabel(
  classification: ReportClassification
): ClassificationLabel {
  return CLASSIFICATION_LABELS[classification] ?? "Real Emergency";
}

export function fromClassificationInput(
  value: string | null | undefined
): ReportClassification | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "real_emergency" ||
    normalized === "real emergency"
  ) {
    return "real_emergency";
  }
  if (normalized === "irrelevant") {
    return "irrelevant";
  }
  if (
    normalized === "rumor_unverified" ||
    normalized === "rumor / unverified" ||
    normalized === "rumor" ||
    normalized === "unverified"
  ) {
    return "rumor_unverified";
  }
  if (
    normalized === "general_question" ||
    normalized === "general question" ||
    normalized === "question"
  ) {
    return "general_question";
  }
  return null;
}

const EMERGENCY_KEYWORDS = [
  "flood",
  "flooding",
  "water has entered",
  "water entered",
  "waterlogging",
  "water rising",
  "rising water",
  "submerged",
  "inundated",
  "stranded",
  "trapped",
  "rescue",
  "evacuate",
  "evacuation",
  "fire",
  "smoke",
  "burning",
  "collapse",
  "collapsed",
  "injured",
  "medical",
  "ambulance",
  "oxygen",
  "casualties",
  "emergency",
  "help needed",
  "need assistance",
  "needs assistance",
  "tree fallen",
  "fallen tree",
  "power line",
  "electrocution",
  "blocked road",
  "shelter",
  // Tamil transliteration / script emergency terms
  "vellam",
  "thanni",
  "thee",
  "உதவி",
  "வெள்ளம்",
  "தண்ணீர்",
  "தீ",
  // Hindi transliteration / script emergency terms
  "baadh",
  "paani",
  "aag",
  "बाढ़",
  "पानी",
  "आग",
  "मदद",
];

const RUMOR_PATTERNS = [
  /\bi heard\b/i,
  /\bsomeone said\b/i,
  /\bthey say\b/i,
  /\bpeople are saying\b/i,
  /\brumor\b/i,
  /\brumour\b/i,
  /\bunconfirmed\b/i,
  /\bforwarded as received\b/i,
  /\bentire\s+[a-z\s]+\s+is\s+underwater\b/i,
  /\bwhole\s+city\b/i,
  /\bdam\s+broke\b/i,
];

const QUESTION_PATTERNS = [
  /^(is|are|can|will|does|do|when|where|what|how|has|have)\b.*\?$/i,
  /\b(is|are)\s+the\s+.*\b(open|closed|working|running|available)\b/i,
  /\b(train|bus|metro|mrts|station)\s+(schedule|timings|open|running)\b/i,
  /\bhelpline\s+number\b/i,
];

const IRRELEVANT_PATTERNS = [
  /\b(good morning|good night|happy birthday|promo|discount|sale|cricket score|movie ticket)\b/i,
  /\btest message\b/i,
];

/**
 * Deterministic fallback classifier for incoming emergency reports.
 * Used when an external LLM API key is not configured or when LLM validation falls back.
 */
export function classifyReportDeterministic(
  rawContent: string
): ClassificationResult {
  const text = rawContent.trim();
  const lower = text.toLowerCase();

  // 1. Check Rumor / Unverified first (e.g., "I heard the entire Velachery area is underwater.")
  for (const pattern of RUMOR_PATTERNS) {
    if (pattern.test(text)) {
      return {
        classification: "rumor_unverified",
        classification_label: "Rumor / Unverified",
        confidence: 0.85,
        filter_reason:
          "Second-hand or sweeping unverified claim without direct witness/location specifics.",
      };
    }
  }

  // 2. Check General Question (unless there is an active emergency distress indicator)
  const hasStrongDistress =
    /\b(stranded|trapped|injured|fire|burning|collapsed|rescue|need assistance|help)\b/i.test(
      text
    );

  if (!hasStrongDistress) {
    for (const pattern of QUESTION_PATTERNS) {
      if (pattern.test(text)) {
        return {
          classification: "general_question",
          classification_label: "General Question",
          confidence: 0.9,
          filter_reason:
            "Non-emergency status/service inquiry rather than an active incident report.",
        };
      }
    }
  }

  // 3. Check Irrelevant noise
  for (const pattern of IRRELEVANT_PATTERNS) {
    if (pattern.test(text)) {
      return {
        classification: "irrelevant",
        classification_label: "Irrelevant",
        confidence: 0.9,
        filter_reason: "Message does not pertain to an emergency or public safety event.",
      };
    }
  }

  // 4. Check Real Emergency keywords
  const matchedKeywords = EMERGENCY_KEYWORDS.filter((kw) =>
    lower.includes(kw.toLowerCase())
  );

  if (matchedKeywords.length > 0) {
    return {
      classification: "real_emergency",
      classification_label: "Real Emergency",
      confidence: Math.min(0.96, 0.78 + matchedKeywords.length * 0.05),
      filter_reason: null,
    };
  }

  // 5. If it ends with a question mark and has no emergency keywords, classify as General Question
  if (text.endsWith("?")) {
    return {
      classification: "general_question",
      classification_label: "General Question",
      confidence: 0.8,
      filter_reason: "General inquiry without emergency indicators.",
    };
  }

  // 6. Default to Irrelevant if no emergency indicators are present
  return {
    classification: "irrelevant",
    classification_label: "Irrelevant",
    confidence: 0.7,
    filter_reason: "No actionable emergency hazard, location, or distress signal detected.",
  };
}
