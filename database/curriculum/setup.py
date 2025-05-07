import os
import json
import psycopg2
from psycopg2 import sql
import dotenv

dotenv.load_dotenv()

# Helper function to execute SQL queries
def execute_query(query, params=None):
    db_url = os.environ.get("NEON_URL")
    if not db_url:
        raise ValueError("NEON_URL environment variable not set.")

    conn = None
    cur = None
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute(query, params)
        conn.commit()
        # For SELECT queries, return results; otherwise, return None
        if cur.description:
            return cur.fetchall()
        return None
    except Exception as e:
        print(f"Error executing query: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

def setup_curriculums_table():
    query = """
    CREATE TABLE IF NOT EXISTS curriculums (
      "programId" VARCHAR(255) PRIMARY KEY,
      "curriculumJson" JSONB NOT NULL
    );
    """
    execute_query(query)
    print("Curriculums table setup complete.")

def seed_curriculums_table():
    program_id = "208"
    # Use a relative path to the JSON data file
    with open("data/courses/curriculum.json", "r") as f:
        curriculum_data = json.load(f)

    if not curriculum_data:
        print(f"Warning: No data found in curriculum.json to seed curriculums table for program {program_id}.")
        return

    query = """
    INSERT INTO curriculums ("programId", "curriculumJson")
    VALUES (%s, %s)
    ON CONFLICT ("programId") DO UPDATE SET "curriculumJson" = EXCLUDED."curriculumJson";
    """

    try:
        execute_query(query, [program_id, json.dumps(curriculum_data)])
    except Exception as e:
        print(f"Error seeding curriculum for program {program_id}: {e}")
        raise

    print(f"Curriculums table seeding complete for program {program_id}.")

if __name__ == "__main__":
    setup_curriculums_table()
    seed_curriculums_table()
