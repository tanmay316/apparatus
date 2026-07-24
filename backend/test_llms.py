import asyncio
import os
import time

from dotenv import load_dotenv

load_dotenv()

# Keys are loaded from .env file or environment variables
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

# Edit these models to test different ones
GROQ_MODEL = "qwen"
NVIDIA_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning" 
GEMINI_MODEL = "gemini-2.0-flash-lite"
OPENROUTER_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"

async def test_groq():
    print(f"\n--- Testing Groq ({GROQ_MODEL}) ---")
    if not GROQ_API_KEY:
        print("SKIPPED: No Groq API Key provided. Set GROQ_API_KEY variable above.")
        return
        
    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import HumanMessage
        
        llm = ChatOpenAI(
            model=GROQ_MODEL,
            api_key=GROQ_API_KEY,
            base_url="https://api.groq.com/openai/v1",
            timeout=30,
            max_tokens=1024
        )
        
        t0 = time.time()
        print("Sending request to Groq...")
        res = await llm.ainvoke([HumanMessage(content="Reply with just the word 'Hello'")])
        latency = time.time() - t0
        
        print(f"[SUCCESS] ({latency:.2f}s)")
        print(f"Response: {res.content}")
        
    except Exception as e:
        latency = time.time() - t0
        print(f"[FAILED] ({latency:.2f}s)")
        print(f"Error Type: {type(e).__name__}")
        print(f"Error Message: {str(e)}")

async def test_nvidia():
    print(f"\n--- Testing NVIDIA ({NVIDIA_MODEL}) ---")
    if not NVIDIA_API_KEY:
        print("SKIPPED: No NVIDIA API Key provided.")
        return
        
    try:
        from langchain_nvidia_ai_endpoints import ChatNVIDIA
        from langchain_core.messages import HumanMessage
        
        llm = ChatNVIDIA(
            model=NVIDIA_MODEL,
            api_key=NVIDIA_API_KEY,
            timeout=30, # seconds before throwing TimeoutError
            max_completion_tokens=1024
        )
        
        t0 = time.time()
        print("Sending request to NVIDIA...")
        res = await llm.ainvoke([HumanMessage(content="Reply with just the word 'Hello'")])
        latency = time.time() - t0
        
        print(f"[SUCCESS] ({latency:.2f}s)")
        print(f"Response: {res.content}")
        
    except Exception as e:
        latency = time.time() - t0
        print(f"[FAILED] ({latency:.2f}s)")
        print(f"Error Type: {type(e).__name__}")
        print(f"Error Message: {str(e)}")

async def test_gemini():
    print(f"\n--- Testing Gemini ({GEMINI_MODEL}) ---")
    if not GEMINI_API_KEY:
        print("SKIPPED: No Gemini API Key provided.")
        return
        
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
        from langchain_core.messages import HumanMessage
        
        llm = ChatGoogleGenerativeAI(
            model=GEMINI_MODEL,
            api_key=GEMINI_API_KEY,
            timeout=30,
            max_output_tokens=1024
        )
        
        t0 = time.time()
        print("Sending request to Gemini...")
        res = await llm.ainvoke([HumanMessage(content="Reply with just the word 'Hello'")])
        latency = time.time() - t0
        
        print(f"[SUCCESS] ({latency:.2f}s)")
        print(f"Response: {res.content}")
        
    except Exception as e:
        latency = time.time() - t0
        print(f"[FAILED] ({latency:.2f}s)")
        print(f"Error Type: {type(e).__name__}")
        print(f"Error Message: {str(e)}")

async def test_openrouter():
    print(f"\n--- Testing OpenRouter ({OPENROUTER_MODEL}) ---")
    if not OPENROUTER_API_KEY:
        print("SKIPPED: No OpenRouter API Key provided.")
        return
        
    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import HumanMessage
        
        llm = ChatOpenAI(
            model=OPENROUTER_MODEL,
            api_key=OPENROUTER_API_KEY,
            base_url="https://openrouter.ai/api/v1",
            timeout=30,
            max_tokens=1024
        )
        
        t0 = time.time()
        print("Sending request to OpenRouter...")
        res = await llm.ainvoke([HumanMessage(content="Reply with just the word 'Hello'")])
        latency = time.time() - t0
        
        print(f"[SUCCESS] ({latency:.2f}s)")
        print(f"Response: {res.content}")
        
    except Exception as e:
        latency = time.time() - t0
        print(f"[FAILED] ({latency:.2f}s)")
        print(f"Error Type: {type(e).__name__}")
        print(f"Error Message: {str(e)}")

async def main():
    print("Starting LLM Provider Tests...")
    
    # Run tests sequentially in priority order: Groq -> NVIDIA -> Gemini -> OpenRouter
    await test_groq()
    await test_nvidia()
    await test_gemini()
    await test_openrouter()
    
    print("\nTests complete!")

if __name__ == "__main__":
    asyncio.run(main())
