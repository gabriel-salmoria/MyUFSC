import crypto from "crypto";

export function normalizeProfessorId(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

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

