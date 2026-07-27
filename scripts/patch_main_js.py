import os
import re

def patch_main_js():
    localappdata = os.environ.get('LOCALAPPDATA', '')
    main_js_path = os.path.join(localappdata, 'Programs', 'Antigravity IDE', 'resources', 'app', 'out', 'main.js')
    
    if not os.path.exists(main_js_path):
        print(f"[Patch] main.js not found at {main_js_path}")
        return False
        
    with open(main_js_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Pattern to match getProfileData(t)
    target = 'async getProfileData(t){'
    if target not in content:
        print("[Patch] Target async getProfileData(t){ not found in main.js")
        return False
        
    if 'async getProfileData(t){return{name:"AG Provider User"' in content:
        print("[Patch] main.js is already patched!")
        return True
        
    # Replace getProfileData body to return mock user identity immediately
    old_code_pattern = re.compile(r'async getProfileData\(t\)\{.*?catch\(n\)\{throw this\._logger\.error\(n\),n\}\}')
    replacement = 'async getProfileData(t){return{name:"AG Provider User",email:"ag-provider@localhost",profilePictureUrl:""}}'
    
    new_content, count = old_code_pattern.subn(replacement, content)
    
    if count == 0:
        print("[Patch] Could not match regex for getProfileData body")
        return False
        
    # Make a backup first if not exists
    backup_path = main_js_path + '.bak'
    if not os.path.exists(backup_path):
        with open(backup_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"[Patch] Backup created at {backup_path}")
        
    with open(main_js_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
        
    print(f"[Patch] Successfully patched getProfileData in main.js ({count} replacement made)")
    return True

if __name__ == '__main__':
    patch_main_js()
