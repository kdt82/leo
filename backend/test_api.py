import httpx
import json

headers = {
    'authorization': 'Bearer 65721a9a-ea84-48f1-bea9-a7d04f83000b', 
    'accept': 'application/json',
    'content-type': 'application/json'
}

image_id = "7e22b47b-89c1-423e-984d-1faf0d1f4855"  # A recently uploaded image

# Test if contextImages supports reference mode/type
tests = [
    # Test 1: referenceMode in contextImage
    {
        "name": "referenceMode in contextImage",
        "payload": {
            "prompt": "a superhero",
            "modelId": "28aeddf8-bd19-4803-80fc-79602d1a9989",
            "width": 1024,
            "height": 1024,
            "contextImages": [
                {"type": "UPLOADED", "id": image_id, "referenceMode": "character"}
            ]
        }
    },
    # Test 2: mode in contextImage
    {
        "name": "mode in contextImage",
        "payload": {
            "prompt": "a superhero",
            "modelId": "28aeddf8-bd19-4803-80fc-79602d1a9989",
            "width": 1024,
            "height": 1024,
            "contextImages": [
                {"type": "UPLOADED", "id": image_id, "mode": "character"}
            ]
        }
    },
    # Test 3: preprocessorId in contextImage (like controlnets)
    {
        "name": "preprocessorId in contextImage",
        "payload": {
            "prompt": "a superhero",
            "modelId": "28aeddf8-bd19-4803-80fc-79602d1a9989",
            "width": 1024,
            "height": 1024,
            "contextImages": [
                {"type": "UPLOADED", "id": image_id, "preprocessorId": 133}
            ]
        }
    }
]

for test in tests:
    print(f"Testing: {test['name']}")
    r = httpx.post('https://cloud.leonardo.ai/api/rest/v1/generations', 
        headers=headers, json=test['payload'], timeout=30)
    print(f"  Status: {r.status_code}")
    if r.status_code != 200:
        error_text = r.text[:200] if len(r.text) > 200 else r.text
        print(f"  Error: {error_text}")
    else:
        print(f"  Success!")
    print()
