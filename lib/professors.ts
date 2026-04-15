import crypto from "crypto";

const ANIMALS = [
  "Capivara",
  "Jacaré",
  "Sagui",
  "Quati",
  "Tucano",
  "Arara",
  "Tamanduá",
  "Preguiça",
  "Gato-do-mato",
  "Macaco-prego",
  "Puma",
  "Ocelote",
  "Tatu",
  "Garça",
  "Coruja",
  "Sapo",
  "Cachorro-do-mato",
  "Gavião",
  "Pica-pau",
  "Teiú",
  "Quero-quero",
  "Marreco",
];

/**
 * Generates a consistent pseudonym for a user in a specific thread.
 *
 * @param authorHash - The unique hash of the user/author.
 * @param professorId - The ID of the parent thread (top-level review).
 * @returns A pseudonym like "Capivara042".
 */
export function generatePseudonym(
  authorHash: string,
  professorId: string,
): string {
  // Create a deterministic hash from the combination of user and thread
  const hash = crypto
    .createHash("sha256")
    .update(authorHash + professorId)
    .digest("hex");

  // Take a portion of the hash to determine the animal and number
  const num = parseInt(hash.substring(0, 8), 16);

  const animal = ANIMALS[num % ANIMALS.length];
  const number = (num % 1000).toString().padStart(3, "0");

  return `${animal}${number}`;
}

/**
 * Checks if the text contains hate speech, profanity, or discriminatory content.
 *
 * @param text - The review or reply text to check.
 * @returns True if the text is clean, false if it contains filtered words.
 */
export function isTextClean(text: string): boolean {
  // Basic profanity and hate-speech filter for PT-BR
  const badWords = [
    "merda",
    "porra",
    "caralho",
    "puta",
    "viado",
    "fuder",
    "foda",
    "cu",
    "buceta",
    "arrombado",
    "corno",
    "otário",
    "retardado",
    "imbecil",
    "idiota",
    "desgraça",
    "filho da puta",
    "macaco",
    "bicha",
    "sapatão",
    "puto",
    "vagabundo",
    "vadia",
  ];

  const normalizedText = text.toLowerCase();

  for (const word of badWords) {
    // Use word boundaries to avoid false positives (e.g., "curto" matching "cu")
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(normalizedText)) {
      return false;
    }
  }

  return true;
}
