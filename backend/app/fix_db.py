import sqlite3
import os

DB_PATH = r"c:\Development\LeonardoNFT\backend\outputs\history.db"

def fix_db():
    print(f"Connecting to {DB_PATH}")
    if not os.path.exists(DB_PATH):
        print("Database file NOT FOUND!")
        return

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    try:
        print("Attempting to add 'imp' column...")
        c.execute('ALTER TABLE generations ADD COLUMN imp TEXT')
        print("Column 'imp' added successfully.")
    except sqlite3.OperationalError as e:
        print(f"Operation failed (column likely exists): {e}")
        
    conn.commit()
    conn.close()

if __name__ == "__main__":
    fix_db()
