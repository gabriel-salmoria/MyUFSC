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

def setup_schedules_table():
    query = """
    CREATE TABLE IF NOT EXISTS schedules (
      "programId" VARCHAR(255) REFERENCES curriculums("programId") ON DELETE CASCADE,
      semester VARCHAR(255) NOT NULL,
      "scheduleJson" JSONB NOT NULL,
      PRIMARY KEY ("programId", semester)
    );
    """
    execute_query(query)
    print("Schedules table setup complete.")

def seed_schedules_table():
    program_id = "208"
    semester = "20251"


    with open(f"data/courses/{program_id}-{semester}.json", "r") as f:
        schedule_data = json.load(f)

    if not schedule_data:
        print("Warning: No schedule data found in curriculum-schedule")
        return

    query = """
    INSERT INTO schedules ("programId", semester, "scheduleJson")
    VALUES (%s, %s, %s)
    ON CONFLICT ("programId", semester) DO UPDATE SET "scheduleJson" = EXCLUDED."scheduleJson";
    """

    try:
        execute_query(query, [program_id, semester, json.dumps(schedule_data)])
    except Exception as e:
        print(f"Error seeding schedule for program {program_id} semester {semester}: {e}")
        raise

    print(f"Schedules table seeding complete for program {program_id} semester {semester}.")

if __name__ == "__main__":
    setup_schedules_table()
    seed_schedules_table()
