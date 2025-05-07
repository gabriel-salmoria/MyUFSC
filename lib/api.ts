import { Curriculum } from "@/types/curriculum"; // Keep this import

export async function fetchCurriculum(programId: string): Promise<Curriculum | null> {
  try {
    const response = await fetch(`/api/course/curriculum/${programId}`)

    if (!response.ok) {
      return null
    }

    const data = await response.json();

    return data
  } catch (error) {
    console.error("Error fetching curriculum on client side:", error);
    return null
  }
}