import os
import asyncio
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
import httpx
from pydantic import BaseModel, Field
from database import (
    db_save_user_ai_config,
    db_get_user_ai_config,
    db_delete_user_ai_config,
)
from models import (
    IngestRequest,
    RecallRequest,
    ResolveRequest,
    ForgetNodeRequest,
    ForgetSourceRequest,
    DecaySettings,
)
from services import (
    set_current_user,
    ingest_source,
    get_ingestion_job,
    get_graph_snapshot,
    answer_query,
    get_ask_topics,
    get_conflict_events,
    resolve_conflict,
    run_decay_check,
    get_decay_settings,
    update_decay_settings,
    get_sources,
    search_nodes,
    generate_node_summary,
    generate_ask_questions,
    forget_node,
    forget_source,
    reset_demo_data,
    get_cognee_activities,
    get_memory_provenance_html,
    get_schema_inventory_data,
    get_session_history,
    get_session_guidance,
    remember_chat_turn,
    add_session_feedback,
    apply_cognee_llm_config,
    import_chat_from_url,
    get_memory_recap,
    connect_cognee_cloud,
    cognee_status,
    run_memory_improve,
)

limiter = Limiter(key_func=get_remote_address)

async def verify_llm_authorization(x_engram_key: str = Header(None), x_user_id: str = Header(default="")):
    secret = os.environ.get("ENGRAM_ACCESS_KEY")
    is_dev = os.environ.get("ENVIRONMENT", "production") == "development"

    # In dev mode, allow requests with a user ID (from the proxy)
    if is_dev and x_user_id:
        return

    # In production, always require the access key
    if not secret:
        raise HTTPException(status_code=500, detail="Server misconfigured: Access keys not configured")

    allowed_keys = {k for k in (secret,) if k}
    if x_engram_key not in allowed_keys:
        raise HTTPException(status_code=403, detail="Access key required.")

app = FastAPI(
    title="Engram — Cognee Backend", 
    version="0.1.0"
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Per-request user context from proxy header
@app.middleware("http")
async def inject_user_context(request: Request, call_next):
    user_id = request.headers.get("X-User-Id", "")
    if user_id:
        set_current_user(user_id)
    return await call_next(request)


@app.on_event("startup")
async def startup_event():
    import cognee
    from services import COGNEE_READY

    # Auto-save default AI config from env vars so BYOK is pre-configured
    gemini_key = os.environ.get("GEMINI_API_KEY")
    groq_key = os.environ.get("GROQ_API_KEY") or os.environ.get("LLM_API_KEY")
    current_config = await asyncio.to_thread(db_get_user_ai_config)
    if not current_config:
        if gemini_key:
            llm_model = (os.environ.get("LLM_MODEL", "gemini/gemini-2.5-flash")).split("/")[-1]
            await asyncio.to_thread(db_save_user_ai_config, "gemini", gemini_key, llm_model)
            print(f"[Startup] Auto-configured AI provider: gemini ({llm_model})", flush=True)
        elif groq_key:
            groq_model = (os.environ.get("LLM_MODEL_FALLBACK", "groq/llama-3.3-70b-versatile")).split("/")[-1]
            await asyncio.to_thread(db_save_user_ai_config, "groq", groq_key, groq_model)
            print(f"[Startup] Auto-configured AI provider: groq ({groq_model})", flush=True)

    # Report/verify hosted Cognee Cloud routing. This is independent of the local
    # SDK: it must run even when COGNEE_READY is False, otherwise a missing cloud
    # config is never surfaced in the logs.
    await connect_cognee_cloud()

    if COGNEE_READY:
        try:
            print("[Cognee] Running startup migrations...", flush=True)
            await cognee.run_migrations()
            print("[Cognee] Startup migrations completed successfully.", flush=True)
        except Exception as e:
            print(f"[Cognee] Startup migrations failed: {e}", flush=True)



@app.get("/")
async def root():
    return {
        "service": "engram-cognee",
        "status": "ok",
        "docs": "/docs",
        "health": "/health",
        "cognee": cognee_status(),
    }


@app.get("/health")
async def health():
    return {"status": "ok", "service": "engram-cognee"}


@app.post("/ingest")
@limiter.limit("10/minute")
async def ingest(request: Request, req: IngestRequest, _auth=Depends(verify_llm_authorization)):
    result = await ingest_source(req)
    return result


class ChatUrlImportRequest(BaseModel):
    url: str = Field(..., max_length=2000)
    label: str | None = Field(None, max_length=200)


@app.post("/import/chat-url")
async def import_chat_url_route(req: ChatUrlImportRequest, request: Request, _auth=Depends(verify_llm_authorization)):
    try:
        user_id = request.headers.get("X-User-Id", "")
        if user_id:
            set_current_user(user_id)
        result = await import_chat_from_url(url=req.url, label=req.label)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/ingest/{job_id}")
async def ingestion_job(job_id: str, _auth=Depends(verify_llm_authorization)):
    job = await get_ingestion_job(job_id)
    if job.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/graph-snapshot")
async def graph_snapshot(_auth=Depends(verify_llm_authorization)):
    return await get_graph_snapshot()


class NodeSummarizeRequest(BaseModel):
    nodeId: str = Field(..., max_length=500)
    label: str = Field(..., max_length=500)
    sourceProvenance: str = Field(..., max_length=5000)


@app.post("/nodes/summarize")
async def node_summarize(req: NodeSummarizeRequest, _auth=Depends(verify_llm_authorization)):
    summary = await generate_node_summary(req.nodeId, req.label, req.sourceProvenance)
    return {"summary": summary}


@app.post("/recall")
@limiter.limit("20/minute")
async def recall(request: Request, req: RecallRequest, _auth=Depends(verify_llm_authorization)):
    return await answer_query(req)


@app.get("/topics")
async def ask_topics(_auth=Depends(verify_llm_authorization)):
    return get_ask_topics()

@app.get("/ask-questions")
async def ask_questions(_auth=Depends(verify_llm_authorization)):
    return await generate_ask_questions()


@app.get("/reconciliation/events")
async def reconciliation_events(_auth=Depends(verify_llm_authorization)):
    return await get_conflict_events()


@app.post("/reconciliation/resolve")
async def reconciliation_resolve(req: ResolveRequest, _auth=Depends(verify_llm_authorization)):
    await resolve_conflict(req)
    return {"status": "ok"}


@app.post("/decay/run")
async def decay_run(request: Request, _auth=Depends(verify_llm_authorization)):
    user_id = request.headers.get("X-User-Id", "")
    return await run_decay_check(user_id=user_id)


@app.post("/memory/improve")
@limiter.limit("6/minute")
async def memory_improve(request: Request, _auth=Depends(verify_llm_authorization)):
    return await run_memory_improve()


@app.get("/decay/settings")
async def decay_settings_get(_auth=Depends(verify_llm_authorization)):
    return await get_decay_settings()


@app.put("/decay/settings")
async def decay_settings_put(settings: DecaySettings, _auth=Depends(verify_llm_authorization)):
    await update_decay_settings(settings)
    return {"status": "ok"}


@app.get("/sources")
async def sources_list(_auth=Depends(verify_llm_authorization)):
    return await get_sources()


@app.get("/nodes/search")
async def nodes_search(q: str = "", _auth=Depends(verify_llm_authorization)):
    return await search_nodes(q)


@app.post("/forget/node")
async def forget_node_endpoint(req: ForgetNodeRequest, _auth=Depends(verify_llm_authorization)):
    await forget_node(req.nodeId)
    return {"status": "ok"}


@app.post("/forget/source")
async def forget_source_endpoint(req: ForgetSourceRequest, _auth=Depends(verify_llm_authorization)):
    await forget_source(req.sourceId)
    return {"status": "ok"}


@app.post("/reset-demo")
async def reset_demo_endpoint(_auth=Depends(verify_llm_authorization)):
    await reset_demo_data()
    return {"status": "ok"}


@app.get("/cognee/activity")
async def cognee_activity_endpoint(_auth=Depends(verify_llm_authorization)):
    return get_cognee_activities()


@app.get("/provenance")
async def memory_provenance(_auth=Depends(verify_llm_authorization)):
    html = await get_memory_provenance_html()
    return HTMLResponse(content=html, media_type="text/html")


@app.get("/schema-inventory")
async def schema_inventory(_auth=Depends(verify_llm_authorization)):
    return await get_schema_inventory_data()


@app.get("/recap")
@limiter.limit("20/minute")
async def memory_recap(request: Request, window: int = 7, _auth=Depends(verify_llm_authorization)):
    window = max(1, min(window, 365))
    return await get_memory_recap(window_days=window)


class SessionQuery(BaseModel):
    session_id: str = Field("default_session", max_length=200)
    last_n: int | None = 5


@app.post("/session/history")
async def session_history(req: SessionQuery, _auth=Depends(verify_llm_authorization)):
    return await get_session_history(session_id=req.session_id, last_n=req.last_n)


@app.post("/session/distill")
async def session_distill(req: SessionQuery, _auth=Depends(verify_llm_authorization)):
    return await get_session_guidance(session_id=req.session_id)


class FeedbackRequest(BaseModel):
    session_id: str = Field(..., max_length=200)
    qa_id: str = Field(..., max_length=200)
    feedback_text: str | None = Field(None, max_length=5000)
    feedback_score: int | None = None


class ChatTurnRequest(BaseModel):
    session_id: str = Field("default_session", max_length=200)
    question: str = Field(..., max_length=50000)
    answer: str = Field(..., max_length=100000)
    context: str = Field("", max_length=50000)


@app.post("/session/remember")
async def session_remember(req: ChatTurnRequest, _auth=Depends(verify_llm_authorization)):
    ok = await remember_chat_turn(
        session_id=req.session_id,
        question=req.question,
        answer=req.answer,
        context=req.context,
    )
    return {"status": "ok" if ok else "error"}


@app.post("/session/feedback")
async def session_feedback(req: FeedbackRequest, _auth=Depends(verify_llm_authorization)):
    ok = await add_session_feedback(
        session_id=req.session_id,
        qa_id=req.qa_id,
        feedback_text=req.feedback_text,
        feedback_score=req.feedback_score,
    )
    return {"status": "ok" if ok else "error"}


class AIConfigRequest(BaseModel):
    provider: str = Field(..., max_length=100)
    apiKey: str = Field(..., max_length=500)
    model: str = Field(..., max_length=200)

class AIModelsRequest(BaseModel):
    provider: str = Field(..., max_length=100)
    key: str = Field(default="", max_length=500)

@app.post("/ai/models")
@limiter.limit("10/minute")
async def get_ai_models(request: Request, req: AIModelsRequest, _auth=Depends(verify_llm_authorization)):
    provider = req.provider
    key = req.key
    
    # For hackathon: if no key provided, use default env key for the default provider
    if not key:
        if provider == "gemini":
            key = os.environ.get("GEMINI_API_KEY", "")
        elif provider == "groq":
            key = os.environ.get("GROQ_API_KEY") or os.environ.get("LLM_API_KEY", "")
    
    if not key:
        raise HTTPException(status_code=400, detail="No API key available for this provider")
        
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if provider == "groq":
                headers = {"Authorization": f"Bearer {key}"}
                r = await client.get("https://api.groq.com/openai/v1/models", headers=headers)
                if r.status_code != 200:
                    raise HTTPException(status_code=r.status_code, detail=f"Groq API error: {r.text}")
                data = r.json()
                models = [m["id"] for m in data.get("data", [])]
                
            elif provider == "openai":
                headers = {"Authorization": f"Bearer {key}"}
                r = await client.get("https://api.openai.com/v1/models", headers=headers)
                if r.status_code != 200:
                    raise HTTPException(status_code=r.status_code, detail=f"OpenAI API error: {r.text}")
                data = r.json()
                models = [m["id"] for m in data.get("data", [])]
                
            elif provider == "gemini":
                headers = {"X-Goog-Api-Key": key}
                r = await client.get("https://generativelanguage.googleapis.com/v1beta/models", headers=headers)
                if r.status_code != 200:
                    raise HTTPException(status_code=r.status_code, detail=f"Gemini API error: {r.text}")
                data = r.json()
                models_raw = data.get("models", [])
                models = []
                for m in models_raw:
                    if "generateContent" in m.get("supportedGenerationMethods", []):
                        name = m.get("name", "")
                        clean_name = name.split("/")[-1] if "/" in name else name
                        models.append(clean_name)
            else:
                raise HTTPException(status_code=400, detail="Invalid provider")
                
            models = sorted(list(set(models)))
            return {"models": models}
            
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Failed to connect to provider: {str(e)}")


@app.get("/ai/config")
async def get_ai_config_endpoint(_auth=Depends(verify_llm_authorization)):
    config = await asyncio.to_thread(db_get_user_ai_config)
    if config:
        return {
            "configured": True,
            "provider": config["provider"],
            "model": config["model"]
        }
    
    # Check for default environment API keys for hackathon/demo mode
    gemini_key = os.environ.get("GEMINI_API_KEY")
    groq_key = os.environ.get("GROQ_API_KEY") or os.environ.get("LLM_API_KEY")
    llm_provider = os.environ.get("LLM_PROVIDER", "gemini")
    
    if gemini_key and (llm_provider == "gemini" or not groq_key):
        return {
            "configured": True,
            "provider": "gemini",
            "model": (os.environ.get("LLM_MODEL", "gemini/gemini-2.5-flash")).split("/")[-1]
        }
    elif groq_key:
        return {
            "configured": True,
            "provider": "groq",
            "model": (os.environ.get("LLM_MODEL_FALLBACK", "groq/llama-3.3-70b-versatile")).split("/")[-1]
        }
    
    return {"configured": False}


@app.post("/ai/config")
@limiter.limit("5/minute")
async def save_ai_config_endpoint(request: Request, config_req: AIConfigRequest, _auth=Depends(verify_llm_authorization)):
    if not config_req.provider or not config_req.model:
        raise HTTPException(status_code=400, detail="Missing required configuration fields")
    
    api_key = config_req.apiKey
    # If no API key provided, use default env key for the provider
    if not api_key:
        if config_req.provider == "gemini":
            api_key = os.environ.get("GEMINI_API_KEY", "")
        elif config_req.provider == "groq":
            api_key = os.environ.get("GROQ_API_KEY") or os.environ.get("LLM_API_KEY", "")
    
    if not api_key:
        raise HTTPException(status_code=400, detail="No API key available for this provider")
    
    await asyncio.to_thread(db_save_user_ai_config, config_req.provider, api_key, config_req.model)
    apply_cognee_llm_config()
    return {"status": "ok"}


@app.delete("/ai/config")
async def delete_ai_config_endpoint(_auth=Depends(verify_llm_authorization)):
    await asyncio.to_thread(db_delete_user_ai_config)
    apply_cognee_llm_config()
    return {"status": "ok"}

