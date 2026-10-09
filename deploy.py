import os
import sys
import subprocess
import requests
import json
import argparse
import urllib.parse
import time
from pathlib import Path
from datetime import datetime

"""
Blockforger One-Command Deploy Script

Usage:
    python deploy.py
    python deploy.py --skip-schema
    python deploy.py --revert

Description:
    Scans for modified files in endpoints, views, and schemas.
    Deploys them to the Blockforger PaaS using the API Key in .env.
"""

# Configuration
TENANT_ID = "football"
BASE_URL = "https://blockforger.net"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))
MODIFIED_FILES_RECORD = os.path.join(SCRIPT_DIR, ".modified_files")
ENV_FILE = os.path.join(SCRIPT_DIR, ".env")


# Paths to watch relative to repo root
WATCH_PATHS = [
    f"public",
    f"endpoints",
    f"views",
    f"schemas",
    f"tenant.properties",
    f"endpoints.properties"
]

def load_env():
    env = {}
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE, 'r') as f:
            for line in f:
                line = line.strip()
                if '=' in line and not line.startswith('#'):
                    key, val = line.split('=', 1)
                    # Strip whitespace AND common quote characters
                    env[key.strip()] = val.strip().strip('"').strip("'")
    return env

def parse_properties(content):
    """Parses .properties file content into a dict."""
    props = {}
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' in line:
            key, val = line.split('=', 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            # Convert booleans
            if val.lower() == 'true': val = True
            elif val.lower() == 'false': val = False
            props[key] = val
    return props

def get_modified_files():
    """Returns a list of modified files in the watched paths."""
    try:
        # Get status of modified files
        result = subprocess.run(
            ["git", "status", "--porcelain"], 
            cwd=ROOT_DIR, 
            capture_output=True, 
            text=True, 
            check=True
        )
        files = []
        for line in result.stdout.splitlines():
            # Use git status --porcelain format which is XY PATH
            if len(line) < 4: continue
            status = line[:2]
            path = line[3:].strip()
            if path.startswith('"') and path.endswith('"'):
                path = path[1:-1]
            
            # Simple inclusion check
            if any(path.startswith(wp) for wp in WATCH_PATHS):
                files.append(path)
        return files
    except subprocess.CalledProcessError as e:
        print(f"Error checking git status: {e}")
        return []
    except FileNotFoundError:
        print("Error: git command not found.")
        return []

def parse_endpoint_filename(filename):
    """
    Parses POST_api_game_combat.py -> ('POST', '/api/game/combat')
    Assumes '_' maps to '/' for path segments.
    """
    base = os.path.splitext(filename)[0] # POST_api_game_combat
    parts = base.split('_')
    method = parts[0].upper()
    
    # Heuristic: Join the rest with '/'
    # This might fail if the path itself has underscores, but matching server logic
    path_str = '/' + '/'.join(parts[1:]) 
    return method, path_str

def deploy_file(path_str, api_key, skip_schema=False):
    """Deploys a single file based on its type."""
    full_path = os.path.join(ROOT_DIR, path_str)
    
    if not os.path.exists(full_path):
        print(f"  [SKIP] File not found (deleted?): {path_str}")
        return {"path": path_str, "status": "skipped", "error": "File not found"}

    if "endpoints" in path_str and path_str.endswith(".py"):
        filename = os.path.basename(path_str)
        method, endpoint_path = parse_endpoint_filename(filename)
        
        with open(full_path, 'r', encoding='utf-8') as f:
            code = f.read()
            
        url = f"{BASE_URL}/api/server-modules/deploy"
        payload = {
            "tenant": TENANT_ID,
            "endpointPath": endpoint_path,
            "method": method,
            "code": code,
            "isAsync": "async" in code.lower()[:500] or "is_async" in code.lower()[:500] 
        }
        
    elif ("views" in path_str or "public" in path_str) and (path_str.endswith(".html") or path_str.endswith(".json") or path_str.endswith(".js") or path_str.endswith(".css")):
        full_path_obj = Path(full_path)
        normalized_path = path_str.replace('\\', '/')
        if "public/" in normalized_path:
            public_dir = Path(ROOT_DIR) / "public"
            try:
                rel_path = str(full_path_obj.relative_to(public_dir)).replace('\\', '/')
            except ValueError:
                rel_path = os.path.basename(path_str)
        elif "views/" in normalized_path:
            views_dir = Path(ROOT_DIR) / "views"
            try:
                rel_path = str(full_path_obj.relative_to(views_dir)).replace('\\', '/')
            except ValueError:
                rel_path = os.path.basename(path_str)
        else:
            rel_path = os.path.basename(path_str)

        page_id = urllib.parse.quote(rel_path, safe='')

        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # FIXED URL: Views are mounted at /api/frontend-views
        url = f"{BASE_URL}/api/frontend-views/pages/{page_id}?tenant={TENANT_ID}"
        payload = {
            "html": content,
        }
        
    elif "schemas" in path_str:
        if skip_schema:
            print(f"  [SKIP] Skipping schema {path_str} (requested via flag)")
            return None
            
        # Try to find tenant config (json or properties)
        tenant_json_path = os.path.join(ROOT_DIR, f"tenants/{TENANT_ID}/schemas/tenant.json")
        tenant_props_path = os.path.join(ROOT_DIR, f"tenants/{TENANT_ID}/tenant.properties")
        
        # Fallback to root of tenant if not in schemas
        if not os.path.exists(tenant_json_path):
            tenant_json_path = os.path.join(ROOT_DIR, f"tenants/{TENANT_ID}/tenant.json")

        tenant_config = {}
        if os.path.exists(tenant_json_path):
            try:
                with open(tenant_json_path, 'r', encoding='utf-8') as f:
                    tenant_config = json.load(f)
            except Exception as e:
                print(f"  [WARN] Failed to load {tenant_json_path}: {e}")
        elif os.path.exists(tenant_props_path):
            try:
                with open(tenant_props_path, 'r', encoding='utf-8') as f:
                    tenant_config = parse_properties(f.read())
            except Exception as e:
                print(f"  [WARN] Failed to load {tenant_props_path}: {e}")
        else:
             print(f"  [WARN] No tenant.json or tenant.properties found. Using empty config.")
             
        try:
            # Handle both JSON schemas and potential property files in schemas folder
            if path_str.endswith(".json"):
                with open(full_path, 'r', encoding='utf-8') as f:
                    schema_content = json.load(f)
                schemas_payload = [schema_content]
            else:
                # If it's a properties file and NOT tenant.properties (handled later), skip it
                print(f"  [SKIP] Skipping non-JSON file in schemas: {path_str}")
                return None
                
            url = f"{BASE_URL}/schemas?tenant={TENANT_ID}"
            payload = {
                "tenant": TENANT_ID,
                "tenantConfig": tenant_config,
                "schemas": schemas_payload
            }
        except Exception as e:
            print(f"  [ERROR] Failed to prepare schema payload: {e}")
            return None
    elif path_str.endswith("tenant.properties"):
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
            tenant_config = parse_properties(content)
            
        url = f"{BASE_URL}/schemas?tenant={TENANT_ID}"
        payload = {
            "tenant": TENANT_ID,
            "tenantConfig": tenant_config,
            "schemas": []
        }
    else:
        print(f"[SKIP] Unknown file type: {path_str}")
        return None

    headers = {
        "x-api-key": api_key,
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(url, json=payload, headers=headers)
        print(f"  [DEBUG] Response Status: {response.status_code}")
        print(f"  [DEBUG] Response Body: {response.text[:500]}") # Limit output
        if response.status_code >= 200 and response.status_code < 300:
            print(f"  [SUCCESS] Deployed {path_str}")
            return {"path": path_str, "status": "success", "response": response.json() if response.text else {}}
        else:
            print(f"  [FAILED] {path_str} - Status: {response.status_code}")
            return {"path": path_str, "status": "failed", "error": response.text}
    except Exception as e:
        print(f"  [ERROR] {path_str}: {e}")
        return {"path": path_str, "status": "error", "error": str(e)}

def record_deployment(deployed_files):
    """Appends successful deployments to .modified_files"""
    history = []
    if os.path.exists(MODIFIED_FILES_RECORD):
        try:
            with open(MODIFIED_FILES_RECORD, 'r') as f:
                history = json.load(f)
        except:
            history = []
            
    # Append new batch
    if deployed_files:
        history.append({
            "timestamp": datetime.now().isoformat(), 
            "files": deployed_files
        })
        
        with open(MODIFIED_FILES_RECORD, 'w') as f:
            json.dump(history, f, indent=2)

def main():
    parser = argparse.ArgumentParser(description="One-command deploy script for Blockforger")
    parser.add_argument("--revert", action="store_true", help="Revert the last deployment")
    parser.add_argument("--skip-schema", action="store_true", default=False, help="Skip deploying schema files")
    parser.add_argument("-y", "--yes", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()
    
    env = load_env()
    api_key = env.get("API_KEY")
    if not api_key:
        print("Error: API_KEY not found in .env")
        sys.exit(1)

    if args.revert:
        print("Revert mode is not fully implemented yet.")
        # Logic would go here: read .modified_files, revert versions
        return

    print("Scanning for modified files...")
    files_to_deploy = get_modified_files()

    # Filter out schemas if skip-schema is set
    if args.skip_schema:
        files_to_deploy = [f for f in files_to_deploy if "schemas" not in f]
    
    if not files_to_deploy:
        print("No modified files found in watched directories.")
        return

    print("\nFiles to be deployed:")
    for f in files_to_deploy:
        print(f" - {f}")

    if not args.yes:
        confirm = input("\nProceed with deployment? [y/N] ").strip().lower()
        if confirm not in ['y', 'yes']:
            print("Aborted.")
            sys.exit(0)

    print("\nDeploying...")
    successful_deployments = []
    for f in files_to_deploy:
        result = deploy_file(f, api_key, skip_schema=args.skip_schema)
        if result and result['status'] == 'success':
            successful_deployments.append(f)
            
    if successful_deployments:
        record_deployment(successful_deployments)

if __name__ == "__main__":
    main()
