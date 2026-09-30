import json
import urllib.request
from urllib.error import URLError, HTTPError
import time

DOCKER_API_URL = "http://docker-proxy:2375"
IMAGE_NAME = "png5-executor"

def execute_code(code: str, session_id: str, timeout: int = 5) -> dict:
    create_url = f"{DOCKER_API_URL}/containers/create"
    container_config = {
        "Image": IMAGE_NAME,
        "Cmd": ["python", "-c", code],
        "NetworkDisabled": True,
        "HostConfig": {
            "ReadonlyRootfs": True,
            "CapDrop": ["ALL"],
            "SecurityOpt": ["no-new-privileges:true"],
            "Tmpfs": {"/tmp": ""},
            "Memory": 128 * 1024 * 1024,
            "NanoCpus": int(0.5 * 1e9),
            "PidsLimit": 50,
            "Binds": [f"/workspace/{session_id}:/workspace"]
        }
    }
    req = urllib.request.Request(
        create_url,
        data=json.dumps(container_config).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method="POST"
    )
    try:
        response = urllib.request.urlopen(req)
        container_data = json.loads(response.read().decode('utf-8'))
        container_id = container_data["Id"]
    except Exception as e:
        raise RuntimeError(f"Failed to create executor container: {e}")
        
    start_url = f"{DOCKER_API_URL}/containers/{container_id}/start"
    req = urllib.request.Request(start_url, method="POST")
    try:
        urllib.request.urlopen(req)
    except Exception as e:
        raise RuntimeError(f"Failed to start executor container: {e}")
        
    wait_url = f"{DOCKER_API_URL}/containers/{container_id}/wait"
    req = urllib.request.Request(wait_url, method="POST")
    try:
        response = urllib.request.urlopen(req, timeout=timeout)
        wait_data = json.loads(response.read().decode('utf-8'))
        returncode = wait_data.get("StatusCode", -1)
    except Exception:
        kill_url = f"{DOCKER_API_URL}/containers/{container_id}/kill"
        try:
            urllib.request.urlopen(urllib.request.Request(kill_url, method="POST"))
        except:
            pass
        raise TimeoutError("Execution timed out")
        
    logs_url = f"{DOCKER_API_URL}/containers/{container_id}/logs?stdout=true&stderr=true"
    req = urllib.request.Request(logs_url)
    try:
        response = urllib.request.urlopen(req)
        logs = response.read()
        logs_text = logs.decode('utf-8', errors='ignore')
    except Exception as e:
        logs_text = f"Failed to get logs: {e}"
        
    delete_url = f"{DOCKER_API_URL}/containers/{container_id}?v=true&force=true"
    try:
        urllib.request.urlopen(urllib.request.Request(delete_url, method="DELETE"))
    except:
        pass
    return {"stdout": logs_text, "stderr": "", "returncode": returncode}
