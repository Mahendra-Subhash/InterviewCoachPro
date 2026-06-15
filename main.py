from fastapi import FastAPI, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from dotenv import load_dotenv
from database import supabase
import os
import traceback

# Load environment variables
load_dotenv()

# Initialize Gemini Client
gemini_key = os.getenv("GEMINI_API_KEY")
if not gemini_key:
    print("WARNING: GEMINI_API_KEY is not set in environment variables.")

client = None
if gemini_key:
    client = genai.Client(api_key=gemini_key)

# FastAPI App
app = FastAPI(title="Interview Coach Pro API")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Pydantic Models
# -----------------------------

class ChatRequest(BaseModel):
    message: str
    session_id: str

class SessionRequest(BaseModel):
    title: str = "New Chat"
    id: str = None  # If provided, update the session with this ID instead of inserting

class FeedbackRequest(BaseModel):
    question: str
    answer: str
    feedback: str
    score: int

# -----------------------------
# Endpoints
# -----------------------------

@app.get("/api/health")
def health():
    return {
        "message": "Interview Coach Pro API Running",
        "status": "online"
    }

@app.post("/session")
def save_or_update_session(data: SessionRequest):
    try:
        if data.id:
            # Update session title (Rename)
            result = supabase.table("chat_sessions").update({
                "title": data.title
            }).eq("id", data.id).execute()
            
            if not result.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Session with ID {data.id} not found."
                )
            return result.data[0]
        else:
            # Create new session
            result = supabase.table("chat_sessions").insert({
                "title": data.title
            }).execute()
            
            if not result.data:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create session."
                )
            return result.data[0]
    except Exception as e:
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

@app.get("/sessions")
def get_sessions():
    try:
        result = (
            supabase.table("chat_sessions")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
        return result.data
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

@app.delete("/session/{session_id}")
def delete_session(session_id: str):
    try:
        result = supabase.table("chat_sessions").delete().eq("id", session_id).execute()
        return {"message": "Session deleted successfully", "data": result.data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

@app.get("/messages/{session_id}")
def get_messages(session_id: str):
    try:
        result = (
            supabase.table("chat_messages")
            .select("*")
            .eq("session_id", session_id)
            .order("created_at", desc=False)
            .execute()
        )
        return result.data
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

@app.post("/chat")
def chat(request: ChatRequest):
    if not client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini API Client is not configured. Please set GEMINI_API_KEY."
        )
    
    try:
        # 1. Fetch conversation history from Supabase for context
        history_result = (
            supabase.table("chat_messages")
            .select("role", "message")
            .eq("session_id", request.session_id)
            .order("created_at", desc=False)
            .execute()
        )
        
        # 2. Build the history contents list for Gemini API
        contents = []
        if history_result.data:
            for msg in history_result.data:
                # Map roles correctly to Gemini's expectations ('user' or 'model')
                role = "user" if msg["role"] == "user" else "model"
                contents.append({
                    "role": role,
                    "parts": [{"text": msg["message"]}]
                })
        
        # 3. Append current user message
        contents.append({
            "role": "user",
            "parts": [{"text": request.message}]
        })
        
        # 4. Generate AI response using Gemini 2.5 Flash
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents
        )
        
        ai_reply = response.text
        if not ai_reply:
            ai_reply = "I'm sorry, I was unable to generate a response. Please try again."
        
        # 5. Save user message and AI response to Supabase
        supabase.table("chat_messages").insert({
            "session_id": request.session_id,
            "role": "user",
            "message": request.message
        }).execute()
        
        supabase.table("chat_messages").insert({
            "session_id": request.session_id,
            "role": "model",
            "message": ai_reply
        }).execute()
        
        return {
            "reply": ai_reply
        }
        
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error in chat processing: {str(e)}"
        )

@app.post("/feedback")
def save_feedback(data: FeedbackRequest):
    try:
        result = supabase.table("feedback").insert({
            "question": data.question,
            "answer": data.answer,
            "feedback": data.feedback,
            "score": data.score
        }).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save feedback."
            )
            
        return {
            "message": "Feedback saved successfully",
            "data": result.data[0]
        }
    except Exception as e:
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

# Mount static files for local development
if os.path.exists("frontend"):
    app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

