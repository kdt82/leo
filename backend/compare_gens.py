import httpx
import json

# Get more generations to find one with reference images
r = httpx.get('https://cloud.leonardo.ai/api/rest/v1/generations/user/94c914aa-9496-4dd4-be34-d78725c4ab39', 
    headers={
        'authorization': 'Bearer 65721a9a-ea84-48f1-bea9-a7d04f83000b', 
        'accept': 'application/json'
    },
    params={'limit': 30}
)
data = r.json()

print("Searching for generations WITH reference images...")
print("=" * 60)

for gen in data.get('generations', []):
    init_strength = gen.get('initStrength')
    has_reference = init_strength is not None
    
    if has_reference:
        print(f"\n*** FOUND GENERATION WITH REFERENCE ***")
        print(f"ID: {gen.get('id')}")
        print(f"Created: {gen.get('createdAt')}")
        print(f"Seed: {gen.get('seed')}")
        print(f"InitStrength: {init_strength}")
        print(f"Style: {gen.get('presetStyle')}")
        print(f"Model: {gen.get('modelId')}")
        
        # Write full details to file
        with open(f'gen_with_ref_{gen.get("id")[:8]}.json', 'w') as f:
            json.dump(gen, f, indent=2, default=str)
        print(f"Full details saved to gen_with_ref_{gen.get('id')[:8]}.json")
