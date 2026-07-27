import sqlite3
import os

def sync_auth():
    appdata = os.environ.get('APPDATA', '')
    main_db = os.path.join(appdata, 'Antigravity IDE', 'User', 'globalStorage', 'state.vscdb')
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, '..'))
    test_db = os.path.join(project_root, '.test-ide-profile', 'User', 'globalStorage', 'state.vscdb')
    
    if not os.path.exists(main_db):
        print(f"[AuthSync] Main profile database not found: {main_db}")
        return
        
    os.makedirs(os.path.dirname(test_db), exist_ok=True)
    
    # Copy or initialize destination DB
    conn_src = sqlite3.connect(main_db)
    conn_dst = sqlite3.connect(test_db)
    
    c_dst = conn_dst.cursor()
    c_dst.execute("CREATE TABLE IF NOT EXISTS ItemTable (key TEXT PRIMARY KEY, value TEXT)")
    
    keys_to_sync = [
        'antigravityUnifiedStateSync.oauthToken',
        'antigravityUnifiedStateSync.userStatus',
        'antigravityUnifiedStateSync.enterprisePreferences',
        'antigravityUnifiedStateSync.modelPreferences'
    ]
    
    synced_count = 0
    c_src = conn_src.cursor()
    for key in keys_to_sync:
        c_src.execute("SELECT value FROM ItemTable WHERE key = ?", (key,))
        row = c_src.fetchone()
        if row:
            c_dst.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)", (key, row[0]))
            synced_count += 1
            
    conn_dst.commit()
    conn_src.close()
    conn_dst.close()
    print(f"[AuthSync] Successfully synchronized {synced_count} auth tokens to test profile.")
    
    # Ensure settings.json in test profile always forces local proxy endpoints
    settings_path = os.path.join(project_root, '.test-ide-profile', 'User', 'settings.json')
    os.makedirs(os.path.dirname(settings_path), exist_ok=True)
    import json
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
