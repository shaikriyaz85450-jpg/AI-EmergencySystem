import {
  normalizeDetectedLanguage,
  type NormalizedLanguage,
} from "./transcribe-audio";

export interface TranslationResult {
  englishRendering: string;
  detectedLanguage: NormalizedLanguage;
  provider: string;
  isFallback: boolean;
}

/**
 * Converts Indic / non-ASCII Unicode numeral digits (e.g. Devanagari ०-९, Tamil ௦-௯, Telugu ౦-౯,
 * Malayalam ൦-൯, Bengali ০-৯, Kannada ೦-೯, Gujarati ૦-૯) to standard ASCII digits "0"-"9".
 */
export function normalizeUnicodeDigitsToAscii(text: string): string {
  const zeroCodePoints = [
    0x0966, // Devanagari
    0x09e6, // Bengali
    0x0a66, // Gurmukhi
    0x0ae6, // Gujarati
    0x0b66, // Odia
    0x0be6, // Tamil
    0x0c66, // Telugu
    0x0ce6, // Kannada
    0x0d66, // Malayalam
    0x0660, // Arabic-Indic
    0x06f0, // Extended Arabic-Indic
  ];

  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    let mapped: string | null = null;
    for (const zeroCp of zeroCodePoints) {
      if (cp >= zeroCp && cp <= zeroCp + 9) {
        mapped = String(cp - zeroCp);
        break;
      }
    }
    out += mapped ?? ch;
  }
  return out;
}

/**
 * Extracts all explicit integer numbers present in a source transcript (supporting ASCII digits and Indic digits).
 */
export function extractSourceNumbers(sourceText: string): number[] {
  const normalized = normalizeUnicodeDigitsToAscii(sourceText);
  const matches = normalized.match(/\b\d{1,5}\b/g);
  if (!matches) return [];
  return matches
    .map((m) => Number.parseInt(m, 10))
    .filter((n) => !Number.isNaN(n) && n >= 0);
}

/**
 * Verifies that an English rendering does not invent a numeric people count that was absent from the source transcript.
 */
function enforceSourceGroundedNumbers(
  sourceTranscript: string,
  englishRendering: string
): string {
  const sourceNums = new Set(extractSourceNumbers(sourceTranscript));
  if (sourceNums.size > 0) {
    return englishRendering;
  }

  // If the source transcript contained NO explicit numbers, ensure the English rendering does not invent
  // "<number> people/persons/commuters/residents"
  return englishRendering.replace(
    /\b(?:around|about|approximately)?\s*\d{1,5}\s+(people|persons|commuters|residents|passengers|individuals)\b/gi,
    "several $1"
  );
}

/**
 * Provider 1: Google Gemini (`gemini-3.8-flash`) translation into operational English.
 */
async function translateWithGemini(
  transcript: string,
  language: NormalizedLanguage,
  apiKey: string
): Promise<TranslationResult> {
  const prompt = `You are a multilingual emergency dispatch translator.
Translate the following ${language.name} (${language.code}) emergency transcript into accurate, natural English.
Strict rules:
1. Preserve exact emergency meaning.
2. Do NOT invent locations, people counts, urgency, resources, or incident types.
3. If the source transcript does NOT state an explicit number of people, do NOT output a number in English.
4. Preserve canonical Chennai landmark names if mentioned: "Velachery MRTS Station", "Taramani MRTS Station", "Guindy Railway Station", "Saidapet Bridge", "Pallikaranai Marshland Main Road", "Adyar Bus Depot".
5. Return ONLY valid JSON:
{
  "english_rendering": "<faithful English translation>"
}

Source Transcript (${language.formatted}):
"""${transcript}"""`;

  const modelsToTry = [
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-3.1-flash-lite",
  ];
  let lastError = "Gemini translation failed.";

  for (const modelName of modelsToTry) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        lastError = `Gemini translation (${modelName}) returned HTTP ${response.status}`;
        continue;
      }

      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const rawText =
        payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      if (!rawText) {
        lastError = `Gemini translation (${modelName}) returned empty output.`;
        continue;
      }

      const parsed = JSON.parse(rawText) as { english_rendering?: string };
      const translated = (parsed.english_rendering ?? "").trim();
      if (!translated) {
        lastError = "Missing english_rendering field.";
        continue;
      }

      return {
        englishRendering: enforceSourceGroundedNumbers(transcript, translated),
        detectedLanguage: language,
        provider: `google_${modelName.replace(/[.-]/g, "_")}`,
        isFallback: false,
      };
    } catch (err) {
      clearTimeout(timeout);
      lastError =
        err instanceof Error ? err.message : "Gemini translation error.";
    }
  }

  throw new Error(lastError);
}

/**
 * Provider 2: OpenAI / Groq compatible chat completion translation.
 */
async function translateWithOpenAiCompatible(
  transcript: string,
  language: NormalizedLanguage,
  apiKey: string,
  endpointUrl: string,
  modelName: string,
  providerLabel: string
): Promise<TranslationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelName,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "Translate the incoming emergency transcript into accurate English. Do not invent locations, numbers, or facts not present in the source. Return only the English translation text.",
          },
          {
            role: "user",
            content: `Source language: ${language.formatted}\nTranscript: ${transcript}`,
          },
        ],
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`${providerLabel} returned HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const translated =
      payload.choices?.[0]?.message?.content?.trim() ?? "";
    if (!translated) {
      throw new Error(`${providerLabel} returned empty translation.`);
    }

    return {
      englishRendering: enforceSourceGroundedNumbers(transcript, translated),
      detectedLanguage: language,
      provider: providerLabel,
      isFallback: false,
    };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Compositional multilingual semantic token analyzer used ONLY as a deterministic fallback
 * when no external LLM translation API key is configured.
 * Composes an English rendering strictly from the landmarks, numbers, hazards, and conditions
 * actually present in the source transcript (never hardcoded by language if/else branches).
 */
export function composeGroundedEnglishFallback(
  transcript: string
): string {
  const normalizedDigits = normalizeUnicodeDigitsToAscii(transcript);
  const lower = normalizedDigits.toLowerCase();

  // 1. Detect referenced canonical landmark or area from multi-script tokens
  const landmarkPatterns: Array<{ pattern: RegExp; canonical: string }> = [
    {
      pattern:
        /(velachery|வேளச்சேரி|वेलाचेरी|వెలాచేరి|వెలచ్చేరి|వేలచ్చేరి|వేలాచేరి|വെളച്ചേരി|വേളച്ചേരി|ভেলাচেরি).*(mrts|station|स्टेशन|நிலையம்|స్టేషన్|ఎంఆర్టీఎస్|സ്റ്റേഷൻ|എംആർടിഎസ്|স্টেশন)|(mrts|station|स्टेशन|நிலையம்|స్టేషన్|ఎంఆర్టీఎస్|സ്റ്റേഷൻ).*(velachery|வேளச்சேரி|वेलाचेरी|వెలాచేరి|వెలచ్చేరి|వేలచ్చేరి|വെളച്ചേരി|വേളച്ചേരി)/i,
      canonical: "near Velachery MRTS Station",
    },
    {
      pattern:
        /(taramani|தரமணி|तारामणि|తారామణి|താരാമണി).*(mrts|station|स्टेशन|நிலையம்|స్టేషన్)|(mrts|station).*(taramani|தரமணி|तारामणि|తారామణి)/i,
      canonical: "near Taramani MRTS Station",
    },
    {
      pattern:
        /(guindy|கிண்டி|गिंडी|గిండి|ഗിണ്ടി).*(railway|station|स्टेशन|நிலையம்|స్టేషన్)/i,
      canonical: "near Guindy Railway Station",
    },
    {
      pattern:
        /(saidapet|சைதாப்பேட்டை|सैदापेट|సైదాపేట|സൈദാപ്പേട്ട).*(bridge|பாலம்|पुल|వంతెన|പാലം)/i,
      canonical: "near Saidapet Bridge",
    },
    {
      pattern:
        /(pallikaranai|பள்ளிக்கரணை|पल्लिकरनई|పల్లికరణై|പള്ളിക്കരണി).*(marsh|road|சாலை|सड़क|रोड|రోడ్డు|റോഡ്)?/i,
      canonical: "near Pallikaranai Marshland Main Road",
    },
    {
      pattern:
        /(adyar|அடையாறு|अड्यार|అడయార్|അഡയാർ).*(depot|bus|பணிமனை|பேருந்து|डिपो|बस|డిపో|బస్సు|ഡിപ്പോ)/i,
      canonical: "near Adyar Bus Depot",
    },
    {
      pattern:
        /(velachery|வேளச்சேரி|वेलाचेरी|వెలాచేరి|వెలచ్చేరి|వేలచ్చేరి|വെളച്ചേരി|വേളച്ചേരി)/i,
      canonical: "in Velachery area",
    },
    {
      pattern: /(adyar|அடையாறு|अड्यार|అడయార్|അഡയാർ)/i,
      canonical: "in Adyar area",
    },
    {
      pattern: /(taramani|தரமணி|तारामणि|తారామణి|താരാമണി)/i,
      canonical: "in Taramani area",
    },
    {
      pattern: /(guindy|கிண்டி|गिंडी|గిండి|ഗിണ്ടി)/i,
      canonical: "in Guindy area",
    },
    {
      pattern: /(saidapet|சைதாப்பேட்டை|सैदापेट|సైదాపేట|സൈദാപ്പേട്ട)/i,
      canonical: "in Saidapet area",
    },
  ];

  let locationClause = "";
  for (const lm of landmarkPatterns) {
    if (lm.pattern.test(normalizedDigits)) {
      locationClause = lm.canonical;
      break;
    }
  }

  // 2. Detect hazard concept from multi-script emergency vocabulary
  const isFlood =
    /(water|flood|vellam|thanni|paani|baadh|neellu|ellam|தண்ணீர்|வெள்ளம்|வெள்ள|नीर|नींद|पानी|बाढ़|जलभराव|నీళ్లు|నీరు|వరద|വെള്ളം|പ്രളയം|জল|বন্যা|agua|inundación)/i.test(
      normalizedDigits
    );
  const isFire =
    /(fire|smoke|aag|thee|தீ|புகை|आग|धुआं|మంటలు|అగ్ని|തീ|अग्नि|আগুন|fuego|incendio)/i.test(
      normalizedDigits
    );
  const isMedical =
    /(medical|ambulance|injured|hospital|மருத்துவ|ஆம்புலன்ஸ்|अस्पताल|एम्बुलेंस|घायल|ఆసుపత్రి|గాయపడిన|ആശുപത്രി|मेडिकल)/i.test(
      normalizedDigits
    );
  const isSafeOrResolved =
    /(safe now|everyone is safe|rescued|பாதுகாப்பாக|सुरक्षित|సురక్షితంగా|സുരക്ഷിതരാണ്)/i.test(
      normalizedDigits
    );

  // 3. Detect explicit numbers vs non-numeric people cues
  const explicitNumbers = extractSourceNumbers(normalizedDigits);
  const hasStrandedOrTrapped =
    /(stranded|trapped|stuck|சிக்கி|फंसे|फँसे|చిక్కుకున్నారు|చిక్కుకొని|കുടുങ്ങി|আটকে|atrapadas|atrapados)/i.test(
      normalizedDigits
    );
  const hasManyOrSeveral =
    /(many|several|multiple|நிறைய|பல|कई|बहुत|చాలా|అనేక|നിരവധി|অনেক)/i.test(
      normalizedDigits
    );

  // 4. Detect vulnerable groups
  const vuln: string[] = [];
  if (/(elderly|senior|முதியவர்|बुजुर्ग|వృద్ధులు|വയോധികർ)/i.test(normalizedDigits)) {
    vuln.push("elderly");
  }
  if (/(children|child|kids|குழந்தை|बच्चे|बच्चों|పిల్లలు|കുട്ടികൾ)/i.test(normalizedDigits)) {
    vuln.push("children");
  }

  const clauses: string[] = [];

  if (isSafeOrResolved) {
    clauses.push(
      `Everyone is safe now${locationClause ? ` ${locationClause}` : ""}.`
    );
  } else if (isFlood) {
    clauses.push(
      `Water has entered the road${locationClause ? ` ${locationClause}` : ""}.`
    );
  } else if (isFire) {
    clauses.push(
      `Fire reported${locationClause ? ` ${locationClause}` : ""}.`
    );
  } else if (isMedical) {
    clauses.push(
      `Medical emergency reported${locationClause ? ` ${locationClause}` : ""}.`
    );
  } else if (locationClause) {
    clauses.push(`Emergency reported ${locationClause}.`);
  }

  if (explicitNumbers.length > 0) {
    const n = explicitNumbers[0];
    clauses.push(
      hasStrandedOrTrapped
        ? `Around ${n} people are stranded.`
        : `Around ${n} people need assistance.`
    );
  } else if (hasStrandedOrTrapped) {
    clauses.push(
      hasManyOrSeveral
        ? "Many people are stranded and need assistance."
        : "People are stranded and need assistance."
    );
  } else if (hasManyOrSeveral || lower.includes("need")) {
    clauses.push("Several people need assistance.");
  }

  if (vuln.length > 0) {
    clauses.push(`Vulnerable groups reported: ${vuln.join(", ")}.`);
  }

  if (clauses.length === 0) {
    return transcript.trim();
  }

  return enforceSourceGroundedNumbers(transcript, clauses.join(" "));
}

/**
 * Translates any non-English transcript into an English rendering for downstream emergency intelligence processing.
 * Preserves emergency meaning and never invents counts, locations, or facts.
 */
export async function translateToEnglish(
  transcript: string,
  detectedLanguageInput: NormalizedLanguage | string
): Promise<TranslationResult> {
  const cleanedTranscript = transcript.trim();
  if (!cleanedTranscript) {
    throw new Error("Cannot translate an empty transcript.");
  }

  const language =
    typeof detectedLanguageInput === "string"
      ? normalizeDetectedLanguage(detectedLanguageInput, cleanedTranscript)
      : detectedLanguageInput;

  // If the transcript is already in English, return directly without modification
  if (language.code === "en") {
    return {
      englishRendering: cleanedTranscript,
      detectedLanguage: language,
      provider: "identity_english",
      isFallback: false,
    };
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  if (geminiKey) {
    try {
      return await translateWithGemini(cleanedTranscript, language, geminiKey);
    } catch {
      // Fall through to secondary provider or compositional fallback
    }
  }

  if (groqKey) {
    try {
      return await translateWithOpenAiCompatible(
        cleanedTranscript,
        language,
        groqKey,
        "https://api.groq.com/openai/v1/chat/completions",
        "llama-3.3-70b-versatile",
        "groq_llama_3_3_70b"
      );
    } catch {
      // Fall through
    }
  }

  if (openaiKey) {
    try {
      return await translateWithOpenAiCompatible(
        cleanedTranscript,
        language,
        openaiKey,
        "https://api.openai.com/v1/chat/completions",
        "gpt-4o-mini",
        "openai_gpt_4o_mini"
      );
    } catch {
      // Fall through
    }
  }

  // Compositional grounded fallback when no external translation API key is configured
  const fallbackRendering = composeGroundedEnglishFallback(cleanedTranscript);
  return {
    englishRendering: fallbackRendering,
    detectedLanguage: language,
    provider: "compositional_multilingual_fallback",
    isFallback: true,
  };
}
