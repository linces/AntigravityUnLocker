import os
import re

def patch_file(path, replacements):
    if not os.path.exists(path):
        print(f"[Patch] File not found: {os.path.basename(path)}")
        return False
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    modified = False
    for pattern, rep in replacements:
        if isinstance(pattern, str):
            if pattern in content:
                content = content.replace(pattern, rep)
                modified = True
        else:
            new_content, count = pattern.subn(rep, content)
            if count > 0:
                content = new_content
                modified = True
                
    if modified:
        backup = path + '.bak'
        if not os.path.exists(backup):
            with open(backup, 'w', encoding='utf-8') as f:
                f.write(content)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"[Patch] Successfully patched {os.path.basename(path)}")
        return True
    return False

def patch_main_js():
    localappdata = os.environ.get('LOCALAPPDATA', '')
    app_dir = os.path.join(localappdata, 'Programs', 'Antigravity IDE', 'resources', 'app')

    main_js = os.path.join(app_dir, 'out', 'main.js')
    jetski_js = os.path.join(app_dir, 'out', 'jetskiAgent', 'main.js')
    wb_js = os.path.join(app_dir, 'out', 'vs', 'workbench', 'workbench.desktop.main.js')

    # 1. Patch main.js
    patch_file(main_js, [
        (re.compile(r'async getProfileData\(t\)\{.*?catch\(n\)\{throw this\._logger\.error\(n\),n\}\}'),
         'async getProfileData(t){return{name:"AG Provider User",email:"ag-provider@localhost",profilePictureUrl:""}}'),
        (re.compile(r'function f_s\(e,t\)\{if\(e==="validatingLogin"\).*?return e==="signedOut"\?\{key:"auth-status".*?:\{key:"auth-status",message:"Log in to use the agent"\}\}'),
         'function f_s(e,t){return void 0;}')
    ])

    # 2. Patch jetskiAgent/main.js
    patch_file(jetski_js, [
        (re.compile(r'function X6i\(e,t\)\{if\(e==="validatingLogin"\).*?return e==="signedOut"\?\{key:"auth-status".*?:\{key:"auth-status",message:"Log in to use the agent"\}\}'),
         'function X6i(e,t){return void 0;}')
    ])

    # 3. Patch workbench.desktop.main.js
    patch_file(wb_js, [
        (re.compile(r'function G8o\(t,e\)\{if\(t==="validatingLogin"\).*?return t==="signedOut"\?\{key:"auth-status".*?:\{key:"auth-status",message:"Log in to use the agent"\}\}'),
         'function G8o(t,e){return void 0;}'),
        (re.compile(r'updateLoginNudgeVisibility\(\)\{if\(!this\.loginNudge\)return;const e=this\._authState!=="signedIn".*?this\.loginNudge\.style\.display=e\?"flex":"none"\}'),
         'updateLoginNudgeVisibility(){if(!this.loginNudge)return;this.loginNudge.style.display="none"}')
    ])
    return True

if __name__ == '__main__':
    patch_main_js()

