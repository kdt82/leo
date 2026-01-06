import asyncio
import os
import json
from dotenv import load_dotenv
from app.services.leonardo_client import LeonardoClient

load_dotenv(os.path.join(os.getcwd(), "frontend", ".env"))
api_key = os.getenv("VITE_LEONARDOAI_API_KEY")

async def main():
    if not api_key:
        print("API Key not found in environment")
        return

    client = LeonardoClient(api_key=api_key)
    
    # Get User ID
    user_info = await client.get_user_info()
    user_details = user_info.get('user_details', [])
    if not user_details:
        print("Could not get user ID")
        return
    user_id = user_details[0]['user']['id']
    print(f"User ID: {user_id}")

    # Fetch last 20 generations
    resp = await client.get_user_generations(user_id, limit=20)
    generations = resp.get('generations', [])
    
    print(f"Fetched {len(generations)} generations.")
    
    # Save to file for inspection
    with open("debug_generations.json", "w") as f:
        json.dump(generations, f, indent=2)
    
    print("Saved to debug_generations.json")

    # Print summary to console
    print("\nSummary of first 5:")
    for gen in generations[:5]:
        print(f"ID: {gen.get('id')}")
        print(f"Prompt: {gen.get('prompt')}")
        print(f"Source?: {gen.get('source')}") # Guessing field names
        print(f"Platform?: {gen.get('platform')}")
        print(f"GeneratedBy?: {gen.get('generated_by')}")
        print(f"Client?: {gen.get('client')}")
        print("-" * 20)

if __name__ == "__main__":
    asyncio.run(main())
