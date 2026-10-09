import type {
  InformationOrigin,
  ReportClassification,
  UrgencyLevel,
} from "@/types/database";
import { getGeminiApiKey } from "@/lib/server/env";
import { normalizeDetectedLanguage } from "@/lib/audio/transcribe-audio";
import {
  composeGroundedEnglishFallback,
  extractSourceNumbers,
  normalizeUnicodeDigitsToAscii,
} from "@/lib/audio/translate-audio";
import {
  classifyReportDeterministic,
  fromClassificationInput,
  toClassificationLabel,
  type ClassificationLabel,
} from "./classify-report";

export type InformationOriginLabel =
  | "AI Extracted"
  | "Responder Confirmed"
  | "Operator";

export interface CanonicalLandmarkSeed {
  canonical_name: string;
  area_name: string;
  city: string;
  latitude: number;
  longitude: number;
  aliases: string[];
}

export const KNOWN_LANDMARKS: CanonicalLandmarkSeed[] = [
  {
    canonical_name: "Velachery MRTS Station",
    area_name: "Velachery",
    city: "Chennai",
    latitude: 12.9756,
    longitude: 80.2207,
    aliases: [
      "Velachery MRTS Station",
      "Velachery Railway Station",
      "Velachery Station",
      "Velachery Train Station",
      "Velachery MRTS",
      "வேளச்சேரி ரயில் நிலையம்",
      "வேளச்சேரி எம்.ஆர்.டி.எஸ் நிலையம்",
      "வேளச்சேரி எம்ஆர்டிஎஸ் நிலையம்",
      "வேளச்சேரி ஸ்டேஷன்",
      "வேளச்சேரி MRTS",
      "वेलाचेरी रेलवे स्टेशन",
      "वेलाचेरी एमआरटीएस स्टेशन",
      "वेलाचेरी MRTS स्टेशन",
      "వెలాచేరి MRTS స్టేషన్",
      "వేలచ్చేరి ఎంఆర్టీఎస్ స్టేషన్",
      "వెలాచేరి ఎంఆర్టీఎస్ స్టేషన్",
      "వెలాచేరి రైల్వే స్టేషన్",
      "వెలచ్చేరి MRTS స్టేషన్",
      "വെളച്ചേരി MRTS സ്റ്റേഷൻ",
      "വേളച്ചേരി എംആർടിഎസ് സ്റ്റേഷൻ",
      "വെളച്ചേരി എംആർടിഎസ് സ്റ്റേഷൻ",
    ],
  },
  {
    canonical_name: "Taramani MRTS Station",
    area_name: "Taramani",
    city: "Chennai",
    latitude: 12.9863,
    longitude: 80.2432,
    aliases: [
      "Taramani MRTS Station",
      "Taramani Station",
      "Taramani Railway Station",
      "Taramani MRTS",
      "தரமணி ரயில் நிலையம்",
      "தரமணி ஸ்டேஷன்",
      "तारामणि रेलवे स्टेशन",
      "तारामणि MRTS स्टेशन",
      "తారామణి MRTS స్టేషన్",
    ],
  },
  {
    canonical_name: "Guindy Railway Station",
    area_name: "Guindy",
    city: "Chennai",
    latitude: 13.0086,
    longitude: 80.2127,
    aliases: [
      "Guindy Railway Station",
      "Guindy Station",
      "Guindy Train Station",
      "கிண்டி ரயில் நிலையம்",
      "गिंडी रेलवे स्टेशन",
      "గిండి రైల్వే స్టేషన్",
    ],
  },
  {
    canonical_name: "Saidapet Bridge",
    area_name: "Saidapet",
    city: "Chennai",
    latitude: 13.0213,
    longitude: 80.2231,
    aliases: [
      "Saidapet Bridge",
      "Maraimalai Adigal Bridge",
      "Saidapet Arch Bridge",
      "Saidapet River Bridge",
      "சைதாப்பேட்டை பாலம்",
      "सैदापेट पुल",
      "సైదాపేట వంతెన",
    ],
  },
  {
    canonical_name: "Pallikaranai Marshland Main Road",
    area_name: "Pallikaranai",
    city: "Chennai",
    latitude: 12.9492,
    longitude: 80.2184,
    aliases: [
      "Pallikaranai Marshland Main Road",
      "Pallikaranai Main Road",
      "Velachery-Tambaram Main Road Pallikaranai",
      "Pallikaranai Causeway",
      "Pallikaranai Marshland",
      "பள்ளிக்கரணை பிரதான சாலை",
      "पल्लिकरनई मुख्य सड़क",
      "పల్లికరణై మెయిన్ రోడ్డు",
    ],
  },
  {
    canonical_name: "Adyar Bus Depot",
    area_name: "Adyar",
    city: "Chennai",
    latitude: 13.0063,
    longitude: 80.2574,
    aliases: [
      "Adyar Bus Depot",
      "Adyar Depot",
      "Adyar Bus Terminus",
      "Adyar Bus Stand",
      "அடையாறு பேருந்து பணிமனை",
      "अड्यार बस डिपो",
      "అడయార్ బస్సు డిపో",
    ],
  },
];

export interface ExtractedReportResult {
  classification: ReportClassification;
  classification_label: ClassificationLabel;
  confidence: number;
  filter_reason: string | null;
  detected_language: string;
  english_rendering: string;
  incident_type: string | null;
  location: string | null;
  landmark: string | null;
  resolved_area: string | null;
  latitude: number | null;
  longitude: number | null;
  location_confidence: number | null;
  people_affected_count: number | null;
  people_affected_description: string | null;
  vulnerable_people: string[];
  resources_needed: string[];
  urgency: UrgencyLevel | null;
  important_evidence: string | null;
  reports_resolution: boolean;
  information_origin: InformationOrigin;
  information_origin_label: InformationOriginLabel;
  processing_mode: "llm_gemini" | "deterministic_fallback";
}

export interface ExtractReportOptions {
  englishRendering?: string | null;
  detectedLanguage?: string | null;
  sourceTranscript?: string | null;
}

export function toInformationOriginLabel(
  origin: InformationOrigin
): InformationOriginLabel {
  switch (origin) {
    case "responder_confirmed":
      return "Responder Confirmed";
    case "operator":
      return "Operator";
    case "ai_extracted":
    default:
      return "AI Extracted";
  }
}

/**
 * Dynamically detects language using Unicode script and vocabulary normalization across any provider language.
 */
export function detectLanguage(
  rawContent: string,
  hintLanguage?: string | null
): string {
  const normalized = normalizeDetectedLanguage(hintLanguage, rawContent);
  return normalized.formatted;
}

/**
 * Extracts ONLY an explicit numeric people count when stated in the report.
 * Never estimates or guesses when a report says "several", "many", or "some".
 * Enforces Part 13: if `sourceTranscript` is provided, the extracted number MUST exist in the source transcript.
 */
export function extractExplicitPeopleCount(
  rawContent: string,
  sourceTranscript?: string | null
): {
  count: number | null;
  description: string | null;
} {
  const normalizedContent = normalizeUnicodeDigitsToAscii(rawContent);
  const sourceCheckText = sourceTranscript
    ? normalizeUnicodeDigitsToAscii(sourceTranscript)
    : normalizedContent;
  const sourceNumbers = new Set(extractSourceNumbers(sourceCheckText));

  // Match explicit digits followed by people/persons/residents/passengers/children/seniors/patients/families
  // or multilingual equivalents (மக்கள்/பேர், लोग/लोगों, మంది, പേർ, জন)
  const explicitMatch = normalizedContent.match(
    /\b(?:around|about|approx(?:imately)?|nearly|over|at least|சுமார்|क्रीब|लगभग|సుమారు|ഏകദേശം)?\s*(\d{1,5})\s*(?:people|persons|residents|passengers|commuters|citizens|individuals|patients|workers|students|children|women|men|seniors|elderly|பேர்|மக்கள்|लोग|लोगों|व्यक्ति|మంది|ప్రజలు|പേർ|জন)\b/i
  );

  if (explicitMatch && explicitMatch[1]) {
    const parsed = Number.parseInt(explicitMatch[1], 10);
    if (
      !Number.isNaN(parsed) &&
      parsed >= 0 &&
      sourceNumbers.has(parsed)
    ) {
      const sentenceMatch = normalizedContent
        .split(/(?<=[.!?।])\s+/)
        .find((s) => s.includes(explicitMatch[0]));
      return {
        count: parsed,
        description: (sentenceMatch ?? explicitMatch[0]).trim(),
      };
    }
  }

  // Non-numeric people phrases (must store count = null)
  const nonNumericMatch = normalizedContent.match(
    /\b((?:several|many|multiple|some|a few|dozens of|group of|crowd of)\s+(?:people|persons|residents|passengers|commuters|families|individuals)[^.!?]*)/i
  );
  if (nonNumericMatch && nonNumericMatch[1]) {
    return {
      count: null,
      description: nonNumericMatch[1].trim(),
    };
  }

  return { count: null, description: null };
}

/**
 * Matches raw text against the 6 canonical project landmarks and known Chennai areas.
 */
export function resolveLocationAndLandmark(rawContent: string): {
  location: string | null;
  landmark: string | null;
  resolved_area: string | null;
  latitude: number | null;
  longitude: number | null;
  location_confidence: number | null;
} {
  const lower = rawContent.toLowerCase();

  for (const item of KNOWN_LANDMARKS) {
    for (const alias of item.aliases) {
      if (lower.includes(alias.toLowerCase())) {
        // Check if there is a phrase like "near <landmark>" or "at <landmark>"
        const locPhraseMatch = rawContent.match(
          new RegExp(
            `\\b((?:near|at|around|outside|inside|opposite|beside)\\s+${alias.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )})`,
            "i"
          )
        );
        return {
          location: locPhraseMatch ? locPhraseMatch[1].trim() : item.canonical_name,
          landmark: item.canonical_name,
          resolved_area: item.area_name,
          latitude: item.latitude,
          longitude: item.longitude,
          location_confidence: 0.95,
        };
      }
    }
  }

  // Check area-level match if no exact landmark matched
  for (const item of KNOWN_LANDMARKS) {
    if (lower.includes(item.area_name.toLowerCase())) {
      const areaPhraseMatch = rawContent.match(
        new RegExp(
          `\\b((?:entire\\s+)?${item.area_name}(?:\\s+area|\\s+main\\s+road)?)`,
          "i"
        )
      );
      return {
        location: areaPhraseMatch ? areaPhraseMatch[1].trim() : item.area_name,
        landmark: null,
        resolved_area: item.area_name,
        latitude: item.latitude,
        longitude: item.longitude,
        location_confidence: 0.65,
      };
    }
  }

  return {
    location: null,
    landmark: null,
    resolved_area: null,
    latitude: null,
    longitude: null,
    location_confidence: null,
  };
}

/**
 * Extracts incident type from report content.
 */
export function extractIncidentType(
  rawContent: string,
  classification: ReportClassification
): string | null {
  if (
    classification === "general_question" ||
    classification === "irrelevant"
  ) {
    return null;
  }

  const lower = rawContent.toLowerCase();

  if (
    /\b(fire|smoke|burning|flames|explosion|short circuit)\b/.test(lower)
  ) {
    return "Fire / Structural Hazard";
  }
  if (
    /\b(water has entered|water entered|flood|flooding|submerged|underwater|inundated|waterlogging|rising water|stranded)\b/.test(
      lower
    )
  ) {
    return "Flood / Waterlogging";
  }
  if (/\b(medical|ambulance|oxygen|injured|heart attack|hospital|pregnancy)\b/.test(lower)) {
    return "Medical Emergency";
  }
  if (/\b(collapse|collapsed|structural|wall fell|building fell)\b/.test(lower)) {
    return "Structural Collapse";
  }
  if (/\b(tree fallen|fallen tree|road blocked|power line|electric pole)\b/.test(lower)) {
    return "Road / Infrastructure Hazard";
  }
  if (/\b(shelter|food|drinking water|relief camp)\b/.test(lower)) {
    return "Shelter / Relief Request";
  }

  return classification === "real_emergency" ? "Emergency Assistance" : null;
}

/**
 * Extracts vulnerable groups mentioned in the report.
 */
export function extractVulnerablePeople(rawContent: string): string[] {
  const groups: string[] = [];
  const lower = rawContent.toLowerCase();

  if (/\b(elderly|senior citizen|seniors|old age|aged)\b/.test(lower)) {
    groups.push("Elderly");
  }
  if (/\b(child|children|kids|infants|babies|baby|newborn)\b/.test(lower)) {
    groups.push("Children / Infants");
  }
  if (/\b(pregnant|maternity)\b/.test(lower)) {
    groups.push("Pregnant Women");
  }
  if (/\b(disabled|wheelchair|bedridden|patients|injured)\b/.test(lower)) {
    groups.push("Medical / Mobility Vulnerable");
  }

  return groups;
}

/**
 * Extracts resources needed based on report content and hazard type.
 */
export function extractResourcesNeeded(
  rawContent: string,
  incidentType: string | null,
  classification: ReportClassification
): string[] {
  if (classification !== "real_emergency") {
    return [];
  }

  const resources = new Set<string>();
  const lower = rawContent.toLowerCase();

  if (/\b(boat|boats|stranded|submerged|water has entered|flood)\b/.test(lower)) {
    resources.add("Rescue Boat");
    resources.add("Flood Rescue Team");
  }
  if (/\b(fire|smoke|burning|flames)\b/.test(lower)) {
    resources.add("Fire Engine");
    resources.add("Emergency Medical Team");
  }
  if (/\b(ambulance|medical|injured|oxygen|hospital|need assistance)\b/.test(lower)) {
    resources.add("Ambulance / Paramedics");
  }
  if (/\b(police|traffic|crowd)\b/.test(lower)) {
    resources.add("Traffic / Police Unit");
  }

  if (resources.size === 0 && incidentType) {
    resources.add("Field Response Team");
  }

  return Array.from(resources);
}

/**
 * Determines urgency level for actionable reports.
 */
export function extractUrgency(
  rawContent: string,
  classification: ReportClassification,
  peopleCount: number | null,
  vulnerablePeople: string[]
): UrgencyLevel | null {
  if (
    classification === "general_question" ||
    classification === "irrelevant"
  ) {
    return null;
  }

  if (classification === "rumor_unverified") {
    return "Low";
  }

  const lower = rawContent.toLowerCase();

  if (
    /\b(fire|trapped|collapsed|critical|unconscious|drowning|electrocution)\b/.test(
      lower
    ) ||
    (peopleCount !== null && peopleCount >= 15) ||
    vulnerablePeople.length > 0
  ) {
    return "High";
  }

  if (/\b(stranded|water has entered|need assistance|blocked)\b/.test(lower)) {
    return "High";
  }

  return "Medium";
}

/**
 * Detects whether a report claims that an emergency is resolved / everyone is safe.
 */
export function detectResolutionClaim(text: string): boolean {
  return /(everyone is safe now|all people are safe|everyone has been rescued|water has receded completely|fire is extinguished|பாதுகாப்பாக|सुरक्षित|సురక్షితంగా|സുരക്ഷിതരാണ്)/i.test(
    text
  );
}

/**
 * Deterministic report extraction and classification pipeline.
 * Supports both English and multilingual reports (using English rendering + source transcript verification).
 */
export function extractReportDeterministic(
  rawContent: string,
  informationOrigin: InformationOrigin = "ai_extracted",
  options?: ExtractReportOptions
): ExtractedReportResult {
  const normalizedLang = normalizeDetectedLanguage(
    options?.detectedLanguage,
    rawContent
  );

  const effectiveEnglishRendering =
    options?.englishRendering && options.englishRendering.trim().length > 0
      ? options.englishRendering.trim()
      : normalizedLang.code === "en"
      ? rawContent.trim()
      : composeGroundedEnglishFallback(rawContent);

  // Combine rawContent and englishRendering so both original script aliases and English keywords are matched
  const combinedForExtraction =
    effectiveEnglishRendering !== rawContent.trim()
      ? `${effectiveEnglishRendering} (${rawContent.trim()})`
      : rawContent.trim();

  const classificationResult = classifyReportDeterministic(
    effectiveEnglishRendering
  );
  const locationInfo =
    resolveLocationAndLandmark(effectiveEnglishRendering).location !== null
      ? resolveLocationAndLandmark(effectiveEnglishRendering)
      : resolveLocationAndLandmark(rawContent);

  const sourceForCountCheck = options?.sourceTranscript ?? rawContent;
  const peopleInfo = extractExplicitPeopleCount(
    effectiveEnglishRendering,
    sourceForCountCheck
  );
  const vulnerablePeople = extractVulnerablePeople(combinedForExtraction);
  const incidentType = extractIncidentType(
    combinedForExtraction,
    classificationResult.classification
  );
  const resourcesNeeded = extractResourcesNeeded(
    combinedForExtraction,
    incidentType,
    classificationResult.classification
  );
  const urgency = extractUrgency(
    combinedForExtraction,
    classificationResult.classification,
    peopleInfo.count,
    vulnerablePeople
  );
  const reportsResolution = detectResolutionClaim(combinedForExtraction);

  return {
    classification: classificationResult.classification,
    classification_label: classificationResult.classification_label,
    confidence: classificationResult.confidence,
    filter_reason: classificationResult.filter_reason,
    detected_language: normalizedLang.formatted,
    english_rendering: effectiveEnglishRendering,
    incident_type: incidentType,
    location: locationInfo.location,
    landmark: locationInfo.landmark,
    resolved_area: locationInfo.resolved_area,
    latitude: locationInfo.latitude,
    longitude: locationInfo.longitude,
    location_confidence: locationInfo.location_confidence,
    people_affected_count:
      classificationResult.classification === "real_emergency"
        ? peopleInfo.count
        : null,
    people_affected_description:
      classificationResult.classification === "real_emergency"
        ? peopleInfo.description
        : null,
    vulnerable_people: vulnerablePeople,
    resources_needed: resourcesNeeded,
    urgency,
    important_evidence: effectiveEnglishRendering,
    reports_resolution: reportsResolution,
    information_origin: informationOrigin,
    information_origin_label: toInformationOriginLabel(informationOrigin),
    processing_mode: "deterministic_fallback",
  };
}

/**
 * Attempts LLM extraction using Gemini API (`gemini-3.8-flash`) if configured in the server environment.
 * Falls back cleanly to deterministic extraction if no key is configured or if the API request fails.
 */
export async function extractAndClassifyReport(
  rawContent: string,
  informationOrigin: InformationOrigin = "ai_extracted",
  options?: ExtractReportOptions
): Promise<ExtractedReportResult> {
  const deterministicBaseline = extractReportDeterministic(
    rawContent,
    informationOrigin,
    options
  );

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return deterministicBaseline;
  }

  try {
    const systemPrompt = `You are an emergency dispatch AI extraction engine for Chennai, India.
Analyze the incoming report and return ONLY valid JSON matching this schema:
{
  "classification": "real_emergency" | "irrelevant" | "rumor_unverified" | "general_question",
  "confidence": number between 0 and 1,
  "filter_reason": string | null,
  "detected_language": string,
  "english_rendering": string,
  "incident_type": string | null,
  "location": string | null,
  "landmark": string | null,
  "people_affected_count": integer | null,
  "people_affected_description": string | null,
  "vulnerable_people": string[],
  "resources_needed": string[],
  "urgency": "Low" | "Medium" | "High" | "Critical" | null,
  "important_evidence": string | null,
  "reports_resolution": boolean
}
Rules:
1. Extract "people_affected_count" ONLY when an explicit number is stated in the source report (e.g., "Around 25 people" -> 25). If the report says "several people", "many people", or does not state a number, set "people_affected_count" to null.
2. Known canonical landmarks: "Velachery MRTS Station", "Taramani MRTS Station", "Guindy Railway Station", "Saidapet Bridge", "Pallikaranai Marshland Main Road", "Adyar Bus Depot".
3. Questions about whether a station/road is open without an emergency must be classified as "general_question".
4. Second-hand sweeping claims like "I heard the entire Velachery area is underwater" must be classified as "rumor_unverified".`;

    const contextBlock =
      options?.englishRendering &&
      options.englishRendering.trim() !== rawContent.trim()
        ? `Incoming Report (Original/Effective):\n"""${rawContent}"""\n\nEnglish Rendering:\n"""${options.englishRendering}"""`
        : `Incoming Report:\n"""${rawContent}"""`;

    const modelsToTry = [
      "gemini-3.5-flash",
      "gemini-3.8-flash",
      "gemini-3.1-flash-lite",
    ];
    let rawJsonText: string | undefined;

    for (const modelName of modelsToTry) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `${systemPrompt}\n\n${contextBlock}`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const candidateText =
        payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (candidateText) {
        rawJsonText = candidateText;
        break;
      }
    }

    if (!rawJsonText) {
      return deterministicBaseline;
    }

    const parsed = JSON.parse(rawJsonText) as Record<string, unknown>;
    const classification =
      fromClassificationInput(
        typeof parsed.classification === "string"
          ? parsed.classification
          : null
      ) ?? deterministicBaseline.classification;

    const sourceForCountCheck = options?.sourceTranscript ?? rawContent;
    const explicitPeople = extractExplicitPeopleCount(
      options?.englishRendering || rawContent,
      sourceForCountCheck
    );

    const normalizedLang = normalizeDetectedLanguage(
      options?.detectedLanguage ??
        (typeof parsed.detected_language === "string"
          ? parsed.detected_language
          : null),
      rawContent
    );

    return {
      ...deterministicBaseline,
      classification,
      classification_label: toClassificationLabel(classification),
      confidence:
        typeof parsed.confidence === "number" &&
        parsed.confidence >= 0 &&
        parsed.confidence <= 1
          ? parsed.confidence
          : deterministicBaseline.confidence,
      filter_reason:
        typeof parsed.filter_reason === "string"
          ? parsed.filter_reason
          : deterministicBaseline.filter_reason,
      detected_language: normalizedLang.formatted,
      english_rendering:
        options?.englishRendering?.trim() ||
        (typeof parsed.english_rendering === "string" &&
        parsed.english_rendering.trim().length > 0
          ? parsed.english_rendering.trim()
          : deterministicBaseline.english_rendering),
      incident_type:
        typeof parsed.incident_type === "string"
          ? parsed.incident_type
          : deterministicBaseline.incident_type,
      location:
        typeof parsed.location === "string"
          ? parsed.location
          : deterministicBaseline.location,
      landmark:
        deterministicBaseline.landmark ??
        (typeof parsed.landmark === "string" ? parsed.landmark : null),
      people_affected_count:
        classification === "real_emergency" ? explicitPeople.count : null,
      people_affected_description:
        classification === "real_emergency"
          ? explicitPeople.description ??
            (typeof parsed.people_affected_description === "string"
              ? parsed.people_affected_description
              : null)
          : null,
      important_evidence:
        typeof parsed.important_evidence === "string"
          ? parsed.important_evidence
          : deterministicBaseline.important_evidence,
      reports_resolution:
        typeof parsed.reports_resolution === "boolean"
          ? parsed.reports_resolution
          : deterministicBaseline.reports_resolution,
      processing_mode: "llm_gemini",
    };
  } catch {
    return deterministicBaseline;
  }
}
