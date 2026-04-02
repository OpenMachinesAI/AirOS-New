import type { FamilyMemoryEntry } from './familyMemory';

export type FamilyMemberRecord = {
  id: string;
  name: string;
  photoDataUrl: string;
  photoDataUrls?: string[];
  memories?: FamilyMemoryEntry[];
  notes?: string;
  birthday?: string;
  birthdayMonthDay?: string;
  lastSeenAt?: number;
  lastGreetedAt?: number;
  lastBirthdayGreetedAt?: number;
};

const RECOGNITION_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const extractJson = (text: string) => {
  const fenced = text.match(/```json\s*([\s\S]+?)```/i);
  if (fenced) return fenced[1];
  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1);
  }
  return text;
};

const getMemberReferenceImages = (member: FamilyMemberRecord) => {
  const images = Array.isArray(member.photoDataUrls) && member.photoDataUrls.length
    ? member.photoDataUrls
    : [member.photoDataUrl];
  return images.filter((url) => typeof url === 'string' && url.startsWith('data:image'));
};

const scoreFaceObservationsAgainstMember = async (
  apiKey: string,
  observedFaceDataUrls: string[],
  member: FamilyMemberRecord
) => {
  const references = getMemberReferenceImages(member);
  if (!references.length) return 0;

  const content: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text: [
        'You are comparing live camera face crops against one saved family member.',
        `The first ${observedFaceDataUrls.length} images are live observations of the same person from the current camera.`,
        `The remaining ${references.length} images are saved reference photos for one person named ${member.name}.`,
        'Score how likely it is that the live observations and the saved reference photos show the same person.',
        'Be robust to different angles, lighting, facial expression, distance, and slight blur.',
        'Use the whole set together, not any single frame by itself.',
        'Return strict JSON only with keys samePerson and confidence.',
        'samePerson must be true or false.',
        'confidence must be a number between 0 and 1.',
        'Use confidence around 0.55 for probable match, 0.7 for strong match, and 0.85 for very strong match.',
      ].join(' '),
    },
    ...observedFaceDataUrls.flatMap((url, index) => [
      { type: 'text', text: `Live observation ${index + 1}` },
      { type: 'image_url', image_url: { url } },
    ]),
    ...references.flatMap((url, index) => [
      { type: 'text', text: `Reference image ${index + 1} for ${member.name}${member.notes ? ` (${member.notes})` : ''}` },
      { type: 'image_url', image_url: { url } },
    ]),
  ];

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: RECOGNITION_VISION_MODEL,
      messages: [{ role: 'user', content }],
      temperature: 0.1,
      max_completion_tokens: 180,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`Face recognition failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  const rawText =
    typeof payload?.choices?.[0]?.message?.content === 'string'
      ? payload.choices[0].message.content
      : Array.isArray(payload?.choices?.[0]?.message?.content)
        ? payload.choices[0].message.content.map((part: any) => String(part?.text || '')).join(' ')
        : '{}';
  const parsed = JSON.parse(extractJson(rawText || '{}'));
  const samePerson = Boolean(parsed?.samePerson);
  const confidenceValue = Number(parsed?.confidence);
  const confidence = Number.isFinite(confidenceValue)
    ? Math.max(0, Math.min(1, confidenceValue))
    : 0;

  return samePerson ? confidence : Math.min(confidence, 0.49);
};

export const compareFaceObservationsToFamily = async (
  apiKey: string,
  observedFaceDataUrls: string[],
  familyMembers: FamilyMemberRecord[]
) => {
  if (!familyMembers.length) {
    return { matchedMemberId: null as string | null, confidence: 0 };
  }

  const observations = observedFaceDataUrls.filter((url) => typeof url === 'string' && url.startsWith('data:image'));
  if (!observations.length) {
    return { matchedMemberId: null as string | null, confidence: 0 };
  }

  const scoreEntries = await Promise.all(
    familyMembers.map(async (member) => ({
      memberId: member.id,
      confidence: await scoreFaceObservationsAgainstMember(apiKey, observations, member),
    }))
  );

  const ranked = scoreEntries
    .filter((entry) => Number.isFinite(entry.confidence))
    .sort((a, b) => b.confidence - a.confidence);

  const best = ranked[0];
  const secondBest = ranked[1];
  if (!best) {
    return { matchedMemberId: null as string | null, confidence: 0 };
  }

  const separation = best.confidence - (secondBest?.confidence ?? 0);
  const accepted =
    best.confidence >= 0.55 &&
    (
      !secondBest ||
      best.confidence >= 0.72 ||
      separation >= 0.08
    );

  return {
    matchedMemberId: accepted ? best.memberId : null,
    confidence: best.confidence,
  };
};

export const compareFaceToFamily = async (
  apiKey: string,
  observedFaceDataUrl: string,
  familyMembers: FamilyMemberRecord[]
) => compareFaceObservationsToFamily(apiKey, [observedFaceDataUrl], familyMembers);
