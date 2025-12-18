import httpx
import json

r = httpx.get('https://cloud.leonardo.ai/api/rest/v1/platformModels', 
    headers={
        'authorization': 'Bearer 65721a9a-ea84-48f1-bea9-a7d04f83000b', 
        'accept': 'application/json'
    })
data = r.json()
for m in data.get('custom_models', []):
    name = m.get('name', '')
    if 'flux' in name.lower():
        print(f"{name}: {m.get('id')}")
