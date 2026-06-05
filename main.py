from fastapi import FastAPI
from pydantic import BaseModel
from google import genai
from dotenv import load_dotenv
import os

from database import supabase

# Load environment variables
load_dotenv()

# Gemini Client
client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)

# FastAPI App
app = FastAPI()


# Request Model
class ChatRequest(BaseModel):
    message: str


# Chat Endpoint
@app.post("/chat")
def chat(request: ChatRequest):

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=request.message
    )

    ai_reply = response.text

    # Save conversation to Supabase
    supabase.table("feedback").insert({
        "question": request.message,
        "answer": ai_reply,
        "feedback": "AI Conversation",
        "score": 10
    }).execute()

    return {
        "reply": ai_reply
    }


# Feedback Endpoint
@app.post("/feedback")
def save_feedback(data: dict):

    supabase.table("feedback").insert({
        "question": data["question"],
        "answer": data["answer"],
        "feedback": data["feedback"],
        "score": data["score"]
    }).execute()

    return {
        "message": "Feedback saved successfully"
    }


# Root Endpoint
@app.get("/")
def home():
    return {
        "message": "Interview Coach Pro API is running successfully"
    }