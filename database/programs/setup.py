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

def setup_programs_table():
    query = """
    CREATE TABLE IF NOT EXISTS programs (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL
    );
    """
    execute_query(query)
    print("Programs table setup complete.")

def seed_programs_table():
    # Use a relative path to the JSON data file
    try:
        with open("data/degree-programs.json", "r") as f:
            programs_data = json.load(f)
    except FileNotFoundError:
        print("Warning: degree-programs.json not found. Skipping seeding programs table.")
        return
    except json.JSONDecodeError:
        print("Error decoding degree-programs.json. Skipping seeding programs table.")
        return

    if not programs_data or "programs" not in programs_data or not programs_data["programs"]:
        print("Warning: No data found in degree-programs.json to seed programs table.")
        return

    # Prepare data for bulk insert/update
    values = [(program["id"], program["name"]) for program in programs_data["programs"]]

    query = """
    INSERT INTO programs (id, name)
    VALUES (%s, %s)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    """

    try:
        # Using executemany for potentially multiple programs
        db_url = os.environ.get("NEON_URL")
        if not db_url:
            raise ValueError("NEON_URL environment variable not set.")

        conn = None
        cur = None
        try:
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.executemany(query, values)
            conn.commit()
        except Exception as e:
            print(f"Error seeding programs table: {e}")
            if conn:
                conn.rollback()
            raise
        finally:
            if cur:
                cur.close()
            if conn:
                conn.close()

    except Exception as e:
        # This outer catch might catch errors from getting db_url or inner try
        print(f"An error occurred during programs seeding preparation or execution: {e}")
        raise

    print("Programs table seeding complete.")

if __name__ == "__main__":
    setup_programs_table()
    seed_programs_table()
