import sqlite3
import os
import json
import subprocess

def kill_test_ide_processes():
    """Kills any running Antigravity IDE instances using the test profile to release SQLite DB locks."""
    try:
        cmd = 'taskkill /F /IM "Antigravity IDE.exe" /FI "COMMANDLINE eq *.test-ide-profile*"'
        subprocess.run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        print(f"[AuthSync] Warning killing existing IDE processes: {e}")

def sync_auth():
    appdata = os.environ.get('APPDATA', '')
    main_db = os.path.join(appdata, 'Antigravity IDE', 'User', 'globalStorage', 'state.vscdb')
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, '..'))
    test_db = os.path.join(project_root, '.test-ide-profile', 'User', 'globalStorage', 'state.vscdb')
    
    os.makedirs(os.path.dirname(test_db), exist_ok=True)
    
    # 1. Kill test profile IDE instances to release SQLite locks
    kill_test_ide_processes()

    # 2. Connect to destination DB
    conn_dst = sqlite3.connect(test_db)
    c_dst = conn_dst.cursor()
    c_dst.execute("CREATE TABLE IF NOT EXISTS ItemTable (key TEXT PRIMARY KEY, value TEXT)")

    synced_count = 0

    # 3. Try reading from main profile DB if it exists
    if os.path.exists(main_db):
        try:
            conn_src = sqlite3.connect(main_db)
            c_src = conn_src.cursor()
            keys_to_sync = [
                'antigravityUnifiedStateSync.oauthToken',
                'antigravityUnifiedStateSync.userStatus',
                'antigravityUnifiedStateSync.enterprisePreferences',
                'antigravityUnifiedStateSync.modelPreferences'
            ]
            for key in keys_to_sync:
                c_src.execute("SELECT value FROM ItemTable WHERE key = ?", (key,))
                row = c_src.fetchone()
                if row:
                    val = row[0]
                    # Ensure state is signedIn, not loginError
                    if key == 'antigravityUnifiedStateSync.oauthToken' and 'loginError' in val:
                        val = val.replace('loginError', 'signedIn').replace('An error occurred', '')
                    c_dst.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)", (key, val))
                    synced_count += 1
            conn_src.close()
        except Exception as e:
            print(f"[AuthSync] Error reading main profile DB: {e}")

    conn_dst.commit()
    conn_dst.close()
    print(f"[AuthSync] Successfully synchronized {synced_count} auth tokens to test profile.")
    
    # 4. Ensure settings.json in test profile always forces local proxy endpoints
    settings_path = os.path.join(project_root, '.test-ide-profile', 'User', 'settings.json')
    os.makedirs(os.path.dirname(settings_path), exist_ok=True)
    settings = {}
    if os.path.exists(settings_path):
        try:
            with open(settings_path, 'r', encoding='utf-8') as f:
                settings = json.load(f)
        except Exception:
            settings = {}
            
    settings["jetski.cloudCodeUrl"] = "http://127.0.0.1:50051"
    settings["antigravity.agentHostAddress"] = "http://127.0.0.1:50051"
    
    with open(settings_path, 'w', encoding='utf-8') as f:
        json.dump(settings, f, indent=2)
    print("[AuthSync] Ensured settings.json forces jetski.cloudCodeUrl and agentHostAddress to 127.0.0.1:50051.")

if __name__ == '__main__':
    sync_auth()
