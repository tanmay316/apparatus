import requests
import os

NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")

# headers = {
#     "Authorization": f"Bearer {NVIDIA_API_KEY}"
# }

# r = requests.get(
#     "https://integrate.api.nvidia.com/v1/models",
#     headers=headers
# )

# print(r.status_code)
# print(r.text)
import requests
import os

headers = {
    "Authorization": f"Bearer {NVIDIA_API_KEY}"
}

models = requests.get(
    "https://integrate.api.nvidia.com/v1/models",
    headers=headers
).json()["data"]

for m in models:
    if "kimi" in m["id"].lower():
        print(m)