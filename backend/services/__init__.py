from typing import Optional
from cache import cache as memory_cache
from models import (
    IngestRequest,
    IngestResponse,
    RecallRequest,
    ChatMessage,
    SourcePill,
    DiffCard,
    TimelinePoint,
    ConflictEvent,
    ResolveRequest,
    GraphSnapshot,
    GraphNode,
    GraphEdge,
    DecaySettings,
    DecayResult,
    Source,
    NodeSearchResult,
    ReconciliationLogEntry,
    ConfidenceHistoryEntry,
    ConnectionItem,
    ConnectionMap,
    MemoryRecap,
    RecapStats,
    RecapEvent,
)
import os
import uuid
import hashlib
import asyncio
import time
import base64
import fnmatch
import re
import json
import httpx
import ipaddress
import socket
import trafilatura
from youtube_transcript_api import YouTubeTranscriptApi
from datetime import datetime, timezone, timedelta
from collections import OrderedDict
import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Per-request user context for data isolation
from context import set_current_user, get_current_user, _cache_key as _ctx_cache_key
_cache_key = _ctx_cache_key

# Load only non-secret config from .env
from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from database import (  # noqa: E402
    db_init,
    db_reseed,
    db_seed_demo,
    db_save_source,
    db_get_sources,
    db_delete_source,
    db_save_conflict,
    db_get_conflicts,
    db_save_reconciliation_log_entry,
    db_get_reconciliation_log,
    db_save_confidence_history_entry,
    db_get_confidence_history,
    db_get_distinct_topics,
    db_get_distinct_users,
    db_get_timeline_topics,
    db_get_decay_settings,
    db_update_decay_settings,
    db_update_source_content,
    db_get_source_content,
    db_update_source_cognee_id,
    db_get_source_cognee_id,
    db_save_qa_feedback,
    db_get_user_ai_config,
)
db_init()

# Cognee Activity Logger for the Live Terminal UI Feed.
# Keyed per user so one user's activity never leaks into another's console feed.
_cognee_activities_by_user: dict[str, list[dict]] = {}
_ACTIVITY_LIMIT = 30

def log_cognee_activity(operation: str, details: str):
    uid = get_current_user() or "_system"
    bucket = _cognee_activities_by_user.setdefault(uid, [])
    bucket.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "operation": operation,
        "details": details,
    })
    if len(bucket) > _ACTIVITY_LIMIT:
        bucket.pop(0)
    # Bound total memory: cap the number of tracked users.
    if len(_cognee_activities_by_user) > 500:
        oldest = next(iter(_cognee_activities_by_user))
        if oldest != uid:
            _cognee_activities_by_user.pop(oldest, None)

# Provider: "gemini" (primary) or "groq" (fallback)
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "gemini")

# Gemini config
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or ""
GEMINI_MODEL = (os.environ.get("LLM_MODEL", "gemini/gemini-2.5-flash")).split("/")[-1]

# Groq fallback config
GROQ_API_KEY = os.environ.get("GROQ_API_KEY") or os.environ.get("LLM_API_KEY") or ""
GROQ_MODEL = (os.environ.get("LLM_MODEL_FALLBACK", "groq/llama-3.3-70b-versatile")).split("/")[-1]

HAS_LLM = bool(GEMINI_API_KEY) or bool(GROQ_API_KEY)

# ---- Cognee initialization ----
COGNEE_READY = False

def get_cognee_dataset(user_id: str | None = None) -> str:
    uid = user_id if user_id else get_current_user()
    return f"engram_{uid}" if uid else "engram_default"

def get_session_id(user_id: str | None = None) -> str:
    uid = user_id if user_id else get_current_user()
    return f"session_{uid}" if uid else "default_session"

try:
    import cognee

    if LLM_PROVIDER == "gemini" and GEMINI_API_KEY:
        cognee.config.set_llm_provider("gemini")
        cognee.config.set_llm_model(f"gemini/{GEMINI_MODEL}")
        cognee.config.set_llm_api_key(GEMINI_API_KEY)
        cognee.config.set_llm_endpoint("")
        print(f"[Cognee] Initialized with provider=gemini, model={GEMINI_MODEL}", flush=True)
    else:
        # Route to Groq via the openai provider adapter
        cognee.config.set_llm_provider("openai")
        cognee.config.set_llm_model(f"groq/{GROQ_MODEL}")
        cognee.config.set_llm_api_key(GROQ_API_KEY)
        cognee.config.set_llm_endpoint("https://api.groq.com/openai/v1")
        print(f"[Cognee] Initialized with provider=groq (via openai client), model={GROQ_MODEL}", flush=True)

    # Set Relational, Vector and Graph storage configurations if environment variables are set
    relational_provider = os.environ.get("RELATIONAL_DB_PROVIDER")
    if relational_provider:
        db_config = {
            "db_provider": relational_provider,
            "db_host": os.environ.get("RELATIONAL_DB_HOST", ""),
            "db_port": int(os.environ.get("RELATIONAL_DB_PORT", 5432)) if os.environ.get("RELATIONAL_DB_PORT") else None,
            "db_name": os.environ.get("RELATIONAL_DB_NAME", ""),
            "db_username": os.environ.get("RELATIONAL_DB_USERNAME", ""),
            "db_password": os.environ.get("RELATIONAL_DB_PASSWORD", ""),
        }
        db_config = {k: v for k, v in db_config.items() if v is not None}
        cognee.config.set_relational_db_config(db_config)
        print(f"[Cognee] Configured relational database with provider={relational_provider}", flush=True)

    vector_provider = os.environ.get("VECTOR_DB_PROVIDER")
    if vector_provider:
        vector_config = {
            "vector_db_provider": vector_provider,
            "vector_db_host": os.environ.get("VECTOR_DB_HOST", ""),
            "vector_db_port": int(os.environ.get("VECTOR_DB_PORT", 5432)) if os.environ.get("VECTOR_DB_PORT") else None,
            "vector_db_name": os.environ.get("VECTOR_DB_NAME", ""),
            "vector_db_username": os.environ.get("VECTOR_DB_USERNAME", ""),
            "vector_db_password": os.environ.get("VECTOR_DB_PASSWORD", ""),
            "vector_db_url": os.environ.get("VECTOR_DB_URL", ""),
            "vector_db_key": os.environ.get("VECTOR_DB_KEY", ""),
        }
        vector_config = {k: v for k, v in vector_config.items() if v is not None}
        cognee.config.set_vector_db_provider(vector_provider)
        cognee.config.set_vector_db_config(vector_config)
        print(f"[Cognee] Configured vector database with provider={vector_provider}", flush=True)

    graph_provider = os.environ.get("GRAPH_DATABASE_PROVIDER")
    if graph_provider:
        graph_config = {
            "graph_database_provider": graph_provider,
            "graph_database_host": os.environ.get("GRAPH_DATABASE_HOST", ""),
            "graph_database_port": int(os.environ.get("GRAPH_DATABASE_PORT", 5432)) if os.environ.get("GRAPH_DATABASE_PORT") else None,
            "graph_database_name": os.environ.get("GRAPH_DATABASE_NAME", ""),
            "graph_database_username": os.environ.get("GRAPH_DATABASE_USERNAME", ""),
            "graph_database_password": os.environ.get("GRAPH_DATABASE_PASSWORD", ""),
            "graph_database_url": os.environ.get("GRAPH_DATABASE_URL", ""),
        }
        graph_config = {k: v for k, v in graph_config.items() if v is not None}
        cognee.config.set_graph_database_provider(graph_provider)
        cognee.config.set_graph_db_config(graph_config)
        print(f"[Cognee] Configured graph database with provider={graph_provider}", flush=True)

    COGNEE_READY = True
except Exception as e:
    print(f"[Cognee] Init failed: {e}", flush=True)


def apply_cognee_llm_config():
    if not COGNEE_READY:
        return
    config = db_get_user_ai_config()
    if config:
        provider = config["provider"]
        api_key = config["api_key"]
        model = config["model"]
        
        cognee.config.set_llm_provider(provider)
        cognee.config.set_llm_model(f"{provider}/{model}" if not model.startswith(f"{provider}/") else model)
        cognee.config.set_llm_api_key(api_key)
        if provider == "groq":
            cognee.config.set_llm_endpoint("https://api.groq.com/openai/v1")
        else:
            cognee.config.set_llm_endpoint("")
        print(f"[Cognee] Applied BYOK configuration: {provider} ({model})", flush=True)
    else:
        if LLM_PROVIDER == "gemini" and GEMINI_API_KEY:
            cognee.config.set_llm_provider("gemini")
            cognee.config.set_llm_model(f"gemini/{GEMINI_MODEL}")
            cognee.config.set_llm_api_key(GEMINI_API_KEY)
            cognee.config.set_llm_endpoint("")
        else:
            cognee.config.set_llm_provider("openai")
            cognee.config.set_llm_model(f"groq/{GROQ_MODEL}")
            cognee.config.set_llm_api_key(GROQ_API_KEY)
            cognee.config.set_llm_endpoint("https://api.groq.com/openai/v1")

# ---- Rate limiting + caching for Groq LLM calls ----
# Cache: LRU, max 64 entries, TTL 5 minutes
_cache: OrderedDict[str, tuple[float, str]] = OrderedDict()
CACHE_MAX = 64
CACHE_TTL = 300  # 5 minutes

# Rate limiter: max 10 LLM calls per 60 seconds per user
_last_calls: dict[str, list[float]] = {}
RATE_MAX = 10
RATE_WINDOW = 60


async def call_llm(prompt: str, system_prompt: str = "You are a precise, analytical assistant.", use_cache: bool = True) -> str:
    # Check cache
    cache_key = hashlib.md5(f"{system_prompt}|{prompt}".encode()).hexdigest()
    if use_cache and cache_key in _cache:
        ts, resp = _cache[cache_key]
        if time.time() - ts < CACHE_TTL:
            _cache.move_to_end(cache_key)
            return resp

    # Rate limit: wait if needed (per-user)
    now = time.time()
    uid = get_current_user() or "default"
    user_calls = _last_calls.setdefault(uid, [])
    user_calls[:] = [t for t in user_calls if now - t < RATE_WINDOW]
    if len(user_calls) >= RATE_MAX:
        sleep_time = user_calls[0] + RATE_WINDOW - now
        if sleep_time > 0:
            await asyncio.sleep(sleep_time)
        user_calls[:] = [t for t in user_calls if now + sleep_time - t < RATE_WINDOW] if sleep_time > 0 else []

    user_calls.append(time.time())

    text = ""
    config = db_get_user_ai_config()

    if config:
        provider = config["provider"]
        api_key = config["api_key"]
        model = config["model"]
        clean_model = model.split("/")[-1]
        
        from openai import AsyncOpenAI
        if provider == "gemini":
            base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
        elif provider == "groq":
            base_url = "https://api.groq.com/openai/v1"
        else:
            base_url = "https://api.openai.com/v1"

        try:
            client = AsyncOpenAI(api_key=api_key, base_url=base_url)
            resp = await client.chat.completions.create(
                model=clean_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=1024,
            )
            text = resp.choices[0].message.content or ""
        except Exception as e:
            print(f"[LLM] User BYOK {provider} failed: {e}", flush=True)
            text = ""
    else:
        if not HAS_LLM:
            return ""
        # Try Gemini (primary), fall back to Groq
        if LLM_PROVIDER == "gemini" and GEMINI_API_KEY:
            try:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=GEMINI_API_KEY, base_url="https://generativelanguage.googleapis.com/v1beta/openai/")
                resp = await client.chat.completions.create(
                    model=GEMINI_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.1,
                    max_tokens=1024,
                )
                text = resp.choices[0].message.content or ""
            except Exception as e:
                print(f"[LLM] Gemini failed: {e}", flush=True)
                text = ""

        # Fallback to Groq if Gemini failed or not configured
        if not text and GROQ_API_KEY:
            try:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")
                resp = await client.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.1,
                    max_tokens=1024,
                )
                text = resp.choices[0].message.content or ""
            except Exception as e:
                print(f"[LLM] Groq fallback failed: {e}", flush=True)

    if text:
        _cache[cache_key] = (time.time(), text)
        if len(_cache) > CACHE_MAX:
            _cache.popitem(last=False)

    return text


# In-memory jobs status store (short-lived, fine for in-memory)
jobs: dict[str, dict] = {}
# Concurrency limit: max 3 background ingestion jobs at once
_ingest_sem = asyncio.Semaphore(3)
_ch_counter = 5

def _evict_stale_jobs():
    now = time.time()
    stale_keys = [
        k for k, v in jobs.items()
        if v.get("status") in ("completed", "failed")
        and now - v.get("_updated_at", 0) > 300
    ]
    for k in stale_keys:
        jobs.pop(k, None)

def _touch_job(job_id: str, **updates):
    updates["_updated_at"] = time.time()
    jobs[job_id].update(updates)


def _github_headers() -> dict:
    """Build GitHub request headers, adding auth when GITHUB_TOKEN is set.

    Without a token, GitHub's REST API is limited to 60 requests/hour and
    private repos are inaccessible. With a token it rises to 5000/hour.
    """
    headers = {
        "User-Agent": "Engram-Cognee-Scraper",
        "Accept": "application/vnd.github+json",
    }
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


async def fetch_github_repo_content(repo_url: str, path_filter: Optional[str] = None) -> tuple[str, list[str]]:
    import zipfile
    import io

    url = repo_url.strip().rstrip("/")
    if url.endswith(".git"):
        url = url[:-4]
        
    parts = url.split("/")
    if len(parts) < 5 or "github.com" not in parts[2]:
        raise ValueError("Invalid GitHub repository URL")
        
    owner = parts[3]
    repo = parts[4]
    
    headers = _github_headers()

    # Resolve the repo's actual default branch first, then fall back to the
    # common ones. Repos whose default branch is not main/master (e.g. develop,
    # trunk) previously failed outright.
    branches: list[str] = []
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
            info = await client.get(f"https://api.github.com/repos/{owner}/{repo}", headers=headers)
            if info.status_code == 200:
                default_branch = info.json().get("default_branch")
                if default_branch:
                    branches.append(default_branch)
    except Exception as e:
        print(f"[Scraper] default branch lookup failed: {e}", flush=True)
    for b in ("main", "master"):
        if b not in branches:
            branches.append(b)

    zip_content = None
    for branch in branches:
        zip_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip"
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
                resp = await client.get(zip_url, headers=headers)
                if resp.status_code == 200:
                    zip_content = resp.content
                    break
        except Exception as e:
            print(f"[Scraper] Failed to download zip for branch {branch}: {e}", flush=True)

    if not zip_content:
        raise ValueError(
            "Could not download the repository zip. Check that the URL is correct and the "
            "repository is public (private repos need a configured GITHUB_TOKEN)."
        )
        
    valid_exts = {".md", ".txt", ".py", ".js", ".jsx", ".ts", ".tsx", ".json", ".html", ".css", ".go", ".rs", ".yml", ".yaml"}
    concatenated = []
    file_paths = []
    
    try:
        with zipfile.ZipFile(io.BytesIO(zip_content)) as z:
            for file_info in z.infolist():
                if file_info.is_dir():
                    continue
                
                filename = file_info.filename
                parts_path = filename.split("/", 1)
                if len(parts_path) < 2:
                    continue
                path = parts_path[1]
                
                _, ext = os.path.splitext(path.lower())
                if ext not in valid_exts:
                    continue
                    
                if path_filter:
                    clean_filter = path_filter.strip()
                    if not clean_filter.startswith("*") and not clean_filter.startswith("/"):
                        if clean_filter not in path:
                            continue
                    else:
                        match_pattern = clean_filter if not clean_filter.startswith("/") else clean_filter[1:]
                        if not fnmatch.fnmatch(path, match_pattern):
                            continue
                
                try:
                    file_lower = path.lower()
                    if any(ignored in file_lower for ignored in ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "cargo.lock", "node_modules", ".git", ".next"]):
                        continue
                        
                    with z.open(file_info) as f:
                        # Strip NUL (0x00): valid in some files but rejected by
                        # Postgres TEXT columns (and Cognee's store).
                        file_content = f.read().decode("utf-8", errors="ignore").replace("\x00", "")
                        if not file_content.strip() or len(file_content) > 100000:
                            continue
                        concatenated.append(f"--- FILE: {path} ---\n{file_content}\n")
                        file_paths.append(path)
                except Exception as e:
                    print(f"[Scraper] Failed to decode/read file {path}: {e}", flush=True)
    except Exception as zip_err:
        raise ValueError(f"Failed to parse repository zip archive: {zip_err}")
                    
    # Fetch recent commits via API
    commits_text = ""
    try:
        commits_url = f"https://api.github.com/repos/{owner}/{repo}/commits?per_page=50"
        async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
            resp = await client.get(commits_url, headers=headers)
            if resp.status_code == 200:
                commits_data = resp.json()
                commits_lines = ["\n\n--- REPOSITORY COMMITS HISTORY ---"]
                for c in commits_data:
                    sha = c.get("sha", "")[:8]
                    commit_info = c.get("commit", {})
                    author = commit_info.get("author", {})
                    date = author.get("date", "")
                    author_name = author.get("name", "")
                    message = commit_info.get("message", "")
                    first_line = message.strip().split("\n")[0] if message else ""
                    commits_lines.append(f"Commit {sha} by {author_name} on {date}: {first_line}")
                commits_text = "\n".join(commits_lines)
    except Exception as e:
        print(f"[Scraper] Failed to fetch commits history for {owner}/{repo}: {e}", flush=True)

    result_content = "\n".join(concatenated)
    if commits_text:
        result_content += commits_text

    return result_content, file_paths


async def save_base64_pdf(content_str: str, label: str) -> str:
    import tempfile

    if "," in content_str:
        header, base64_data = content_str.split(",", 1)
    else:
        base64_data = content_str

    pdf_bytes = base64.b64decode(base64_data)

    MAX_PDF_SIZE = 10 * 1024 * 1024  # 10 MB
    if len(pdf_bytes) > MAX_PDF_SIZE:
        raise ValueError(f"PDF exceeds maximum size of {MAX_PDF_SIZE // (1024*1024)} MB")

    # Validate PDF magic bytes
    if not pdf_bytes.startswith(b"%PDF-"):
        raise ValueError("File is not a valid PDF (missing PDF header)")

    # Validate PDF structure with PyMuPDF (optional)
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        doc.close()
    except ImportError:
        pass  # PyMuPDF not installed, skip structural check
    except Exception as e:
        raise ValueError(f"PDF parsing failed: {e}")

    # Write to secure random temp file
    tmp_dir = os.path.join(os.path.dirname(__file__), "tmp_uploads")
    os.makedirs(tmp_dir, exist_ok=True)

    safe_label = "".join(c for c in label if c.isalnum() or c in (".", "_", "-")).rstrip()
    if not safe_label.endswith(".pdf"):
        safe_label += ".pdf"

    fd, file_path = tempfile.mkstemp(dir=tmp_dir, suffix=".pdf", prefix="")
    os.close(fd)

    with open(file_path, "wb") as f:
        f.write(pdf_bytes)

    return file_path


def fetch_youtube_transcript(url: str) -> str:
    video_id = None
    if "v=" in url:
        video_id = url.split("v=")[1].split("&")[0]
    elif "youtu.be/" in url:
        video_id = url.split("youtu.be/")[1].split("?")[0]
        
    if not video_id:
        raise ValueError("Could not extract YouTube video ID")
        
    try:
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)
        transcript = transcript_list.find_transcript(["en"])
        transcript_data = transcript.fetch()
        transcript_text = " ".join([t.text for t in transcript_data])
        return transcript_text
    except Exception as e:
        raise ValueError(f"Could not retrieve YouTube transcript: {e}")


def _block_internal_ips(url: str) -> None:
    _validate_url_safety(url)
    from urllib.parse import urlparse
    host = urlparse(url).hostname
    if host and (host.endswith(".internal") or host == "metadata.google.internal"):
        raise ValueError(f"Blocked request to internal host: {host}")

def fetch_article_content(url: str) -> str:
    _block_internal_ips(url)
    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        raise ValueError("Could not download article content")
    text = trafilatura.extract(downloaded)
    if not text:
        raise ValueError("Could not extract text from article content")
    return text


async def _run_ingest_with_semaphore(job_id: str, source: Source, req: IngestRequest, user_id: str = ""):
    async with _ingest_sem:
        await run_ingest_background(job_id, source, req, user_id)

async def run_ingest_background(job_id: str, source: Source, req: IngestRequest, user_id: str = ""):
    if user_id:
        set_current_user(user_id)
    file_path_to_remember = None
    try:
        content = ""
        
        if req.type == "github":
            if not req.url:
                raise ValueError("GitHub Repository URL is required")
            content, file_paths = await fetch_github_repo_content(req.url, req.pathFilter)
            import json as _json
            source.filePath = _json.dumps(file_paths[:15])
        elif req.type == "pdf":
            file_path_to_remember = await save_base64_pdf(req.content, req.label)
            content = f"[Ingested PDF: {req.label}]"
            source.filePath = file_path_to_remember
        elif req.type == "youtube":
            if not req.url:
                raise ValueError("YouTube Video URL is required")
            content = fetch_youtube_transcript(req.url)
        elif req.type == "article":
            if not req.url:
                raise ValueError("Article URL is required")
            content = fetch_article_content(req.url)
        else:
            content = req.content

        # Postgres TEXT columns (and the Cognee store) reject NUL (0x00) bytes,
        # which can appear in any ingested source. Strip them once here so every
        # downstream write (metadata DB + Cognee remember) is safe.
        if content:
            content = content.replace("\x00", "")

        _touch_job(job_id, currentStep="extracting", progress=30)
        db_update_source_content(source.id, content)

        # Run Cognee ingestion and reconciliation in parallel
        async def do_cognee():
            # Prefer the hosted Cognee Cloud tenant when connected (REST API).
            if cognee_cloud_active():
                from cognee_cloud import get_cloud_client
                client = get_cloud_client()
                if client:
                    try:
                        truncated = content[:50000] if len(content) > 50000 else content
                        full = f"[Source: {req.label} | Type: {req.type} | Ingested: {datetime.now(timezone.utc).isoformat()}]\n\n{truncated}"
                        # Make sure the tenant dataset exists before adding text, so
                        # the subsequent cognify() has a valid target to build the graph on.
                        try:
                            await client.ensure_dataset(get_cognee_dataset())
                        except Exception as ds_err:
                            print(f"[Cognee Cloud] ensure_dataset warning ({ds_err})", flush=True)
                        # Prefer schema-guided extraction: hand Cognee a typed ontology so
                        # it builds Fact/Decision/Topic nodes with supersedes/contradicts
                        # edges instead of generic chunks. Fall back to the proven
                        # add_text + cognify path if the tenant rejects the graph model.
                        try:
                            from graph_model import ENGRAM_GRAPH_MODEL, ENGRAM_CUSTOM_PROMPT
                            # Deterministic filename ties this source to a stable
                            # Cognee data item so forget() can later prune by exact id.
                            data_filename = f"engram_{source.id}.md"
                            await client.remember(
                                full,
                                get_cognee_dataset(),
                                filename=data_filename,
                                graph_model=ENGRAM_GRAPH_MODEL,
                                custom_prompt=ENGRAM_CUSTOM_PROMPT,
                                run_in_background=True,
                            )
                            log_cognee_activity("remember()", f"[Cloud] Ingested '{req.label}' with typed ontology (Fact/Decision/Topic)")
                            # Resolve and persist the tenant data-item UUID (exact
                            # name match), so pruning is deterministic, not fuzzy.
                            try:
                                ds_id = await client.dataset_id_for(get_cognee_dataset())
                                if ds_id:
                                    resolved = await client.data_id_for(ds_id, data_filename)
                                    if resolved:
                                        db_update_source_cognee_id(source.id, resolved)
                            except Exception as rid_err:
                                print(f"[Cognee Cloud] could not resolve data id for '{req.label}' ({rid_err})", flush=True)
                            return
                        except Exception as typed_err:
                            print(f"[Cognee Cloud] typed remember() failed ({typed_err}); using add_text + cognify.", flush=True)
                            await client.remember_text(full, get_cognee_dataset(), run_in_background=True)
                            log_cognee_activity("remember()", f"[Cloud] Ingested '{req.label}' → cognify started on tenant")
                            return
                    except Exception as e:
                        print(f"[Cognee Cloud] ingest failed ({e}); falling back to local memory.", flush=True)

            if not COGNEE_READY:
                return
            apply_cognee_llm_config()
            try:
                truncated = content[:50000] if len(content) > 50000 else content
                full = f"[Source: {req.label} | Type: {req.type} | Ingested: {datetime.now(timezone.utc).isoformat()}]\n\n{truncated}"
                if file_path_to_remember:
                    await cognee.remember(file_path_to_remember, dataset_name=get_cognee_dataset())
                else:
                    await cognee.remember(full, dataset_name=get_cognee_dataset())
                log_cognee_activity("remember()", f"Ingested source '{req.label}'")
                
                try:
                    await asyncio.wait_for(cognee.cognify(datasets=[get_cognee_dataset()]), timeout=10.0)
                    log_cognee_activity("cognify()", f"Generated knowledge graph schemas for '{req.label}'")
                except asyncio.TimeoutError:
                    print("[Cognee] cognify timed out, proceeding", flush=True)
                
                try:
                    await asyncio.wait_for(cognee.memify(dataset=get_cognee_dataset()), timeout=10.0)
                    log_cognee_activity("memify()", f"Indexed concepts and relation structures for '{req.label}'")
                except asyncio.TimeoutError:
                    print("[Cognee] memify timed out, proceeding", flush=True)
            except Exception as e:
                print(f"[Cognee] ingestion failed: {e}", flush=True)

        async def do_reconciliation():
            return await run_reconciliation(
                content=content, label=req.label, date=datetime.now(timezone.utc).isoformat()
            )

        _touch_job(job_id, currentStep="improve", progress=60)
        cognee_task = asyncio.create_task(do_cognee())
        recon_task = asyncio.create_task(do_reconciliation())

        await cognee_task
        source.status = "ready"
        source.lastSyncedAt = datetime.now(timezone.utc).isoformat()
        db_save_source(source)
        _touch_job(job_id, currentStep="reconcile", progress=80)

        try:
            await recon_task
            _touch_job(job_id, progress=100, status="completed")
        except Exception as recon_err:
            print(f"[Reconciliation] failed for {req.label}: {recon_err}", flush=True)
            _touch_job(job_id, currentStep="reconcile_failed", progress=100, status="completed")

    except Exception as e:
        source.status = "failed"
        db_save_source(source)
        _touch_job(job_id, status="failed", error=str(e))
    finally:
        if file_path_to_remember and os.path.exists(file_path_to_remember):
            try:
                os.remove(file_path_to_remember)
            except OSError:
                pass


async def ingest_source(req: IngestRequest) -> IngestResponse:
    job_id = str(uuid.uuid4())
    source_id = str(uuid.uuid4())

    source = Source(
        id=source_id,
        type=req.type,
        label=req.label,
        url=req.url,
        ingestedAt=datetime.now(timezone.utc).isoformat(),
        lastSyncedAt=None,
        status="processing",
    )
    db_save_source(source)

    jobs[job_id] = {
        "id": job_id,
        "sourceId": source_id,
        "currentStep": "fetching",
        "progress": 0,
        "status": "running",
        "error": None,
        "_updated_at": time.time(),
    }
    _evict_stale_jobs()

    # Run the actual heavy lifting in the background
    uid = get_current_user()
    asyncio.create_task(_run_ingest_with_semaphore(job_id, source, req, uid))

    return IngestResponse(jobId=job_id, status="started")


async def get_ingestion_job(job_id: str) -> dict:
    return jobs.get(job_id, {"status": "not_found"})


async def run_reconciliation(content: str, label: str, date: str) -> list[dict]:
    new_nodes = []
    now = datetime.now(timezone.utc).isoformat()

    # Use LLM to detect contradictions vs existing knowledge
    existing_sources = db_get_sources()
    existing_conflicts = db_get_conflicts(include_resolved=True)

    existing_summaries = "\n".join(
        f'- Source "{s.label}" ({s.type}): {s.status}'
        for s in existing_sources
    )
    conflict_summaries = "\n".join(
        f'- Conflict "{c.topic}": old="{c.oldNodeSummary}" ({c.oldNodeSource}), new="{c.newNodeSummary}" ({c.newNodeSource}) → {c.relationship}'
        for c in existing_conflicts
    )
    sys_prompt = (
        "You analyze new content against an existing knowledge graph. "
        "Detect if the new content introduces a different claim (contradiction or superseding) "
        "on the same topic as any existing knowledge. Respond with ONLY a JSON array of objects, "
        "each with these fields: topic (str), summary (str, one line), "
        "relationship (\"contradicts\" or \"supersedes\"), confidenceScore (float 0-1). "
        "Return [] if no contradictions found. "
        "Be conservative — only flag genuine factual conflicts on the same topic."
    )
    user_prompt = (
        f"Existing sources:\n{existing_summaries}\n\n"
        f"Existing conflicts:\n{conflict_summaries}\n\n"
        f"New content from \"{label}\" on {date}:\n{content[:2000]}\n\n"
        f"Analyze for contradictions or supersessions. Return JSON array."
    )
    contradictions = None
    if HAS_LLM:
        for attempt in range(3):
            llm_result = await call_llm(user_prompt, system_prompt=sys_prompt)
            if llm_result:
                import json as _json
                try:
                    cleaned = llm_result.strip()
                    if cleaned.startswith("```"):
                        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
                        if "```" in cleaned:
                            cleaned = cleaned.rsplit("```", 1)[0]
                    cleaned = cleaned.strip()
                    if cleaned.startswith("["):
                        contradictions = _json.loads(cleaned)
                        break
                except Exception as parse_err:
                    print(f"[Reconciliation] LLM parse error on attempt {attempt+1}: {parse_err}", flush=True)
            
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)

    if contradictions is None:
        print("[Reconciliation] Failed to detect conflicts using LLM after 3 attempts.", flush=True)
        raise RuntimeError("Reconciliation failed due to LLM error")

    for c in contradictions:
        topic = c.get("topic", "Unknown")
        summary = c.get("summary", "")
        relationship = c.get("relationship", "contradicts")
        confidence = c.get("confidenceScore", 0.85)

        # Find old node info from existing conflicts (use newest old side as anchor)
        old_node_summary = summary
        old_node_date = date
        old_node_source = label
        for ec in existing_conflicts:
            if ec.topic == topic:
                old_node_summary = ec.newNodeSummary
                old_node_date = ec.newNodeDate
                old_node_source = ec.newNodeSource
                break

        conflict_id = str(uuid.uuid4())[:8]
        new_conflict = ConflictEvent(
            id=conflict_id,
            oldNodeSummary=old_node_summary,
            oldNodeDate=old_node_date,
            oldNodeSource=old_node_source,
            newNodeSummary=summary,
            newNodeDate=date,
            newNodeSource=label,
            topic=topic,
            relationship=relationship,
            llmConfidence=confidence,
            status="pending",
            resolutionNote=None,
            createdAt=now,
        )
        db_save_conflict(new_conflict)

        log_id = "log_" + str(uuid.uuid4())[:8]
        db_save_reconciliation_log_entry(ReconciliationLogEntry(
            id=log_id, eventType="changed", topic=topic,
            oldSummary=old_node_summary, newSummary=summary, source=label, createdAt=now,
        ))
        
        ch_id = "ch_" + str(uuid.uuid4())[:8]
        db_save_confidence_history_entry(ConfidenceHistoryEntry(
            id=ch_id, topic=topic,
            valueSummary=summary, confidenceScore=confidence, reason="superseded", date=date,
        ))
        new_nodes.append({
            "topic": topic, "summary": summary,
            "date": date, "source": label,
            "old_summary": old_node_summary,
            "old_date": old_node_date, "old_source": old_node_source,
        })

    return new_nodes


async def get_graph_snapshot() -> GraphSnapshot:
    cached = memory_cache.get(_cache_key("graph_snapshot"))
    if cached is not None:
        return cached
    # Prefer the hosted Cognee Cloud tenant's dataset graph when connected
    if cognee_cloud_active():
        from cognee_cloud import get_cloud_client
        client = get_cloud_client()
        if client:
            try:
                ds_id = await client.dataset_id_for(get_cognee_dataset())
                if ds_id:
                    g = await client.dataset_graph(ds_id)
                    c_nodes = g.get("nodes", []) if isinstance(g, dict) else []
                    c_edges = g.get("edges", []) if isinstance(g, dict) else []
                    if c_nodes:
                        mapped_nodes = []
                        for n in c_nodes:
                            props = n.get("properties", {}) or {}
                            ntype = n.get("type", "Entity") or "Entity"
                            name = n.get("label") or props.get("name") or "Entity"
                            label = f"{name} ({ntype})" if ntype != "Entity" else name
                            cc = sum(1 for e in c_edges if e.get("source") == n.get("id") or e.get("target") == n.get("id"))
                            mapped_nodes.append(GraphNode(
                                id=str(n.get("id")), label=str(label)[:40],
                                summary=f"{ntype}: {name}", confidenceScore=0.9,
                                sourceProvenance="Cognee Cloud",
                                lastReinforcedAt=datetime.now(timezone.utc).isoformat(),
                                connectionCount=cc, status="active",
                                isDecisionType=(ntype == "Entity"),
                            ))
                        mapped_edges = [
                            GraphEdge(source=str(e.get("source")), target=str(e.get("target")),
                                      relationship=str(e.get("label", "related")), confidence=0.8)
                            for e in c_edges
                        ]
                        MAX_NODES = 300
                        if len(mapped_nodes) > MAX_NODES:
                            mapped_nodes = mapped_nodes[:MAX_NODES]
                            ids = {n.id for n in mapped_nodes}
                            mapped_edges = [e for e in mapped_edges if e.source in ids and e.target in ids]
                        log_cognee_activity("dataset_graph()", f"[Cloud] Fetched {len(mapped_nodes)} nodes from tenant")
                        result = GraphSnapshot(nodes=mapped_nodes, edges=mapped_edges)
                        memory_cache.set(_cache_key("graph_snapshot"), result, ttl=30)
                        return result
            except Exception as e:
                print(f"[Cognee Cloud] graph fetch failed ({e}); falling back.", flush=True)
    # Try to fetch real graph data from Cognee first
    if COGNEE_READY:
        apply_cognee_llm_config()
        try:
            try:
                nodes, edges = await cognee.get_memory_provenance_graph(
                    include_memory=True,
                    datasets=[get_cognee_dataset()],
                )
            except TypeError:
                # Older/newer SDK signatures may not accept `datasets`
                nodes, edges = await cognee.get_memory_provenance_graph(include_memory=True)
            mapped_nodes = []
            seen_nodes = set()
            for n in nodes:
                node_id = str(n.id)
                if node_id in seen_nodes:
                    continue
                seen_nodes.add(node_id)
                node_type = n.properties.get("type", "Entity")
                if node_type in ("User", "Dataset", "Session", "TextDocument", "Document"):
                    continue
                node_name = n.properties.get("name") or n.properties.get("text") or "Entity"
                label = f"{node_name} ({node_type})" if node_type != "Entity" else node_name
                summary = f"{node_type}: {node_name}"
                connection_count = sum(1 for e in edges if e.source == node_id or e.target == node_id)
                mapped_nodes.append(GraphNode(
                    id=node_id,
                    label=label[:40],
                    summary=summary,
                    confidenceScore=0.9,
                    sourceProvenance="Cognee Graph",
                    lastReinforcedAt=datetime.now(timezone.utc).isoformat(),
                    connectionCount=connection_count,
                    status="active",
                    isDecisionType=True if node_type == "Entity" else False
                ))
            mapped_edges = []
            for e in edges:
                mapped_edges.append(GraphEdge(
                    source=str(e.source),
                    target=str(e.target),
                    relationship=str(e.relation),
                    confidence=0.8
                ))
            if mapped_nodes:
                MAX_NODES = 300
                if len(mapped_nodes) > MAX_NODES:
                    mapped_nodes = mapped_nodes[:MAX_NODES]
                    node_ids = {n.id for n in mapped_nodes}
                    mapped_edges = [e for e in mapped_edges if e.source in node_ids and e.target in node_ids]
                result = GraphSnapshot(nodes=mapped_nodes, edges=mapped_edges)
                memory_cache.set(_cache_key("graph_snapshot"), result, ttl=30)
                return result
        except Exception as cognee_err:
            print(f"[Cognee] get_memory_provenance_graph failed: {cognee_err}", flush=True)

    # Fallback: derive nodes from database conflicts and sources with files
    node_id_counter = 0
    seen_labels: set[str] = set()
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []
    db_conflicts = db_get_conflicts(include_resolved=True)
    db_sources = db_get_sources()

    # 1. Build nodes and edges from conflicts
    conflict_node_map = {}
    for c in db_conflicts:
        for variant, is_decision in [(c.newNodeSummary, True), (c.oldNodeSummary, False)]:
            label = variant[:40]
            if label in seen_labels:
                continue
            seen_labels.add(label)
            node_id_counter += 1
            node_id_str = f"conflict_{node_id_counter}"
            status = "active" if is_decision else "superseded"
            nodes.append(GraphNode(
                id=node_id_str, label=label, summary=variant,
                confidenceScore=c.llmConfidence if is_decision else 0.1,
                sourceProvenance=c.newNodeSource if is_decision else c.oldNodeSource,
                lastReinforcedAt=c.newNodeDate if is_decision else c.oldNodeDate,
                connectionCount=1, status=status, isDecisionType=is_decision,
            ))
            conflict_node_map[variant] = node_id_str

    # Connect conflict nodes
    for c in db_conflicts:
        source_id = conflict_node_map.get(c.newNodeSummary)
        target_id = conflict_node_map.get(c.oldNodeSummary)
        if source_id and target_id:
            edges.append(GraphEdge(
                source=source_id, target=target_id,
                relationship=c.relationship, confidence=c.llmConfidence
            ))

    # 2. Build source-level nodes and their file structures
    for s in db_sources:
        source_node_id = f"src_{s.id}"
        nodes.append(GraphNode(
            id=source_node_id,
            label=s.label[:40],
            summary=f"Source: {s.label}",
            confidenceScore=0.90,
            sourceProvenance=s.label,
            lastReinforcedAt=s.ingestedAt,
            connectionCount=0,
            status="active",
            isDecisionType=False
        ))

        # Connect source to its files if it is a GitHub repository
        if s.type == "github" and s.filePath:
            import json as _json
            try:
                files = _json.loads(s.filePath)
                for f in files:
                    node_id_counter += 1
                    file_node_id = f"file_{node_id_counter}"
                    file_name = f.split("/")[-1]
                    nodes.append(GraphNode(
                        id=file_node_id,
                        label=file_name[:40],
                        summary=f"File path: {f}",
                        confidenceScore=0.85,
                        sourceProvenance=s.label,
                        lastReinforcedAt=s.ingestedAt,
                        connectionCount=1,
                        status="active",
                        isDecisionType=False
                    ))
                    edges.append(GraphEdge(
                        source=source_node_id,
                        target=file_node_id,
                        relationship="contains",
                        confidence=0.90
                    ))
            except Exception as json_err:
                print(f"[Graph] Failed to parse files JSON: {json_err}", flush=True)

        # Connect sources to conflict nodes they are associated with
        for c in db_conflicts:
            if s.label in (c.newNodeSource, c.oldNodeSource):
                target_node_id = conflict_node_map.get(c.newNodeSummary) or conflict_node_map.get(c.oldNodeSummary)
                if target_node_id:
                    edges.append(GraphEdge(
                        source=source_node_id,
                        target=target_node_id,
                        relationship="mentions",
                        confidence=0.7
                    ))

    MAX_NODES = 300
    if len(nodes) > MAX_NODES:
        nodes = nodes[:MAX_NODES]
        node_ids = {n.id for n in nodes}
        edges = [e for e in edges if e.source in node_ids and e.target in node_ids]

    result = GraphSnapshot(nodes=nodes, edges=edges)
    memory_cache.set(_cache_key("graph_snapshot"), result, ttl=30)
    return result


def extract_query_terms(query: str) -> list[str]:
    query_lower = query.lower()
    stopwords = {
        "what", "is", "a", "the", "about", "did", "change", "changed", "how", "why", "who", "where",
        "to", "from", "for", "in", "on", "of", "and", "or", "project", "repo", "github", "source",
        "i", "my", "me", "we", "us", "our", "you", "your", "he", "she", "it", "they", "them",
        "before", "now", "vs", "versus", "after", "then", "believe", "believed", "think", "thought",
        "since", "earlier", "back", "made", "have", "has", "had", "timeline", "decision", "decisions",
    }
    query_terms = [word.strip("?,.!-()\"'") for word in query_lower.split()]
    return [word for word in query_terms if word and len(word) > 2 and word not in stopwords]


def get_term_overlap_score(query_terms: list[str], candidate: str) -> int:
    candidate_lower = candidate.lower()
    return sum(1 for term in query_terms if term in candidate_lower)


def get_matched_topic(query: str, available_topics: list[str]) -> Optional[str]:
    """Match a query against the provided list of topics using a robust term-overlap score
    modeled on the get_relevant_db_context pattern."""
    query_terms = extract_query_terms(query)
    if not available_topics or not query_terms:
        return None

    db_conflicts = db_get_conflicts(include_resolved=True)

    best_match = None
    best_score = 0
    for topic in available_topics:
        # Calculate term overlap score for the topic name
        score = 0
        topic_lower = topic.lower()
        for term in query_terms:
            if term in topic_lower:
                score += 3  # High weight for matching the topic name directly
                
        # Also check associated conflicts for this topic to match detailed queries
        for c in db_conflicts:
            if c.topic.lower() == topic_lower:
                for term in query_terms:
                    if (term in c.oldNodeSummary.lower() or 
                        term in c.newNodeSummary.lower() or 
                        term in c.oldNodeSource.lower() or 
                        term in c.newNodeSource.lower()):
                        score += 1

        if score > best_score:
            best_score = score
            best_match = topic

    if best_match and best_score > 0:
        return best_match
    return None


def get_relevant_db_context(query: str, db_sources: list, db_conflicts: list) -> list[str]:
    query_terms = extract_query_terms(query)
    relevant_lines = []

    if not query_terms:
        for s in db_sources[:5]:
            relevant_lines.append(f"- Source \"{s.label}\" ({s.type}, ingested {s.ingestedAt})")
        for c in db_conflicts[:5]:
            relevant_lines.append(f"- Conflict in \"{c.topic}\" — old: \"{c.oldNodeSummary}\" (from source \"{c.oldNodeSource}\", dated {c.oldNodeDate}) vs new: \"{c.newNodeSummary}\" (from source \"{c.newNodeSource}\", dated {c.newNodeDate}) → {c.relationship} (confidence {c.llmConfidence})")
        return relevant_lines

    referenced_sources = set()
    for c in db_conflicts:
        is_relevant = False
        for term in query_terms:
            if (term in c.topic.lower() or 
                term in c.oldNodeSummary.lower() or 
                term in c.newNodeSummary.lower() or 
                term in c.oldNodeSource.lower() or 
                term in c.newNodeSource.lower()):
                is_relevant = True
                break
        if is_relevant:
            relevant_lines.append(f"- Conflict in \"{c.topic}\" — old: \"{c.oldNodeSummary}\" (from source \"{c.oldNodeSource}\", dated {c.oldNodeDate}) vs new: \"{c.newNodeSummary}\" (from source \"{c.newNodeSource}\", dated {c.newNodeDate}) → {c.relationship} (confidence {c.llmConfidence})")
            referenced_sources.add(c.oldNodeSource)
            referenced_sources.add(c.newNodeSource)

    for s in db_sources:
        is_relevant = s.label in referenced_sources
        if not is_relevant:
            for term in query_terms:
                if term in s.label.lower() or (s.url and term in s.url.lower()):
                    is_relevant = True
                    break
        if is_relevant:
            relevant_lines.append(f"- Source \"{s.label}\" ({s.type}, ingested {s.ingestedAt})")
            raw = db_get_source_content(s.label)
            if raw and len(raw.strip()) > 20:
                relevant_lines.append(f"  Content ({len(raw.strip())} chars):")
                for i in range(0, len(raw.strip()), 4000):
                    relevant_lines.append(f"  {raw.strip()[i:i+4000]}")
            
    if not relevant_lines:
        for s in db_sources[:3]:
            relevant_lines.append(f"- Source \"{s.label}\" ({s.type}, ingested {s.ingestedAt})")
            raw = db_get_source_content(s.label)
            if raw and len(raw.strip()) > 20:
                snippet = raw.strip()[:4000]
                relevant_lines.append(f"  Content: {snippet}")
            
    return relevant_lines


def get_ask_topics() -> dict[str, list[str]]:
    cached = memory_cache.get(_cache_key("ask_topics"))
    if cached is not None:
        return cached
    tracked_topics = db_get_distinct_topics()
    timeline_topics = db_get_timeline_topics()
    result = {
        "trackedTopics": tracked_topics,
        "timelineTopics": timeline_topics,
    }
    memory_cache.set(_cache_key("ask_topics"), result, ttl=60)
    return result


async def generate_ask_questions() -> list[str]:
    sources = db_get_sources()
    if not sources:
        return []

    topics = db_get_distinct_topics()
    if not topics:
        return []

    source_labels = [s.label for s in sources if s.label]
    summary_parts = []
    if source_labels:
        summary_parts.append("Ingested sources: " + ", ".join(source_labels[:10]))
    if topics:
        summary_parts.append("Topics in knowledge graph: " + ", ".join(topics[:10]))

    context = ". ".join(summary_parts)
    if not context:
        return []

    prompt = (
        f"You are a helpful assistant helping a user explore their personal knowledge graph.\n\n"
        f"Here is what the user has imported:\n{context}\n\n"
        f"Generate exactly 3 concise, insightful questions the user might want to ask about their knowledge. "
        f"Questions should probe for insights, changes over time, relationships between topics, "
        f"or decisions made. Output ONLY a JSON array of 3 strings, no other text.\n\n"
        f"Example: [\"What changed about Topic X?\", \"How does Topic Y relate to Topic Z?\", "
        f"\"What decisions have I made about Topic W?\"]"
    )
    try:
        raw = await call_llm(prompt, system_prompt="You are a precise analytical assistant.", use_cache=False)
        raw = raw.strip().strip("```json").strip("```").strip()
        questions = json.loads(raw)
        if not isinstance(questions, list) or len(questions) == 0:
            return []
        return [str(q).strip() for q in questions[:3]]
    except Exception:
        return topics[:3] if topics else []


_commits_cache: dict[str, tuple[float, str]] = {}
COMMITS_CACHE_TTL = 300  # 5 minutes

async def fetch_github_commits(repo_url: str) -> str:
    import time
    url = repo_url.strip().rstrip("/")
    if url.endswith(".git"):
        url = url[:-4]
        
    if url in _commits_cache:
        ts, cached_val = _commits_cache[url]
        if time.time() - ts < COMMITS_CACHE_TTL:
            return cached_val

    parts = url.split("/")
    if len(parts) < 5 or "github.com" not in parts[2]:
        return ""
        
    owner = parts[3]
    repo = parts[4]
    
    headers = _github_headers()
    
    commits_url = f"https://api.github.com/repos/{owner}/{repo}/commits?per_page=30"
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
            resp = await client.get(commits_url, headers=headers)
            if resp.status_code == 200:
                commits_data = resp.json()
                commits_lines = [f"\n--- Recent Git Commits for {owner}/{repo} ---"]
                for c in commits_data:
                    sha = c.get("sha", "")[:8]
                    commit_info = c.get("commit", {})
                    author = commit_info.get("author", {})
                    date = author.get("date", "")
                    author_name = author.get("name", "")
                    message = commit_info.get("message", "")
                    first_line = message.strip().split("\n")[0] if message else ""
                    commits_lines.append(f"- Commit {sha} by {author_name} on {date}: {first_line}")
                commits_text = "\n".join(commits_lines)
                _commits_cache[url] = (time.time(), commits_text)
                return commits_text
    except Exception as e:
        print(f"[LLM-Commits] Failed to fetch commits history for {owner}/{repo}: {e}", flush=True)
    return ""


async def answer_query(req: RecallRequest) -> ChatMessage:
    query = req.query.lower()
    msg_id = str(uuid.uuid4())

    intent: str = "standard"
    correlation_keywords = {"connect", "connection", "connections", "correlate", "correlation", "link", "linked", "relationship", "related"}
    changed_phrases = ("what changed", "whats changed", "what's changed", "what has changed",
                       "changed since", "changed about", "any changes", "what updated", "what's new", "whats new")
    if any(k in query for k in correlation_keywords):
        intent = "cross_correlation"
    elif any(p in query for p in changed_phrases):
        intent = "what_changed"
    elif "believe" in query or "timeline" in query or "before" in query or "before vs" in query:
        intent = "temporal_belief"

    db_sources = db_get_sources()
    db_conflicts = db_get_conflicts(include_resolved=True)

    # Build filtered knowledge graph context for the LLM
    graph_ctx_lines = ["Knowledge Graph Contents:"]
    graph_ctx_lines.extend(get_relevant_db_context(req.query, db_sources, db_conflicts))

    # Dynamically inject git commit history only for repo/history-style questions.
    history_keywords = {"changed", "change", "changes", "commit", "commits", "history", "git", "since", "repository", "repo", "author"}
    if any(k in query for k in history_keywords):
        for s in db_sources:
            if s.type == "github" and s.url:
                commits_ctx = await fetch_github_commits(s.url)
                if commits_ctx:
                    graph_ctx_lines.append(commits_ctx)

    if db_conflicts:
        graph_ctx_lines.append("\n[Active Conflicts & Decisions:]")
        for c in db_conflicts:
            graph_ctx_lines.append(
                f"- Topic: {c.topic}\n"
                f"  Old Belief: {c.oldNodeSummary} (Source: {c.oldNodeSource}, Date: {c.oldNodeDate})\n"
                f"  New Belief: {c.newNodeSummary} (Source: {c.newNodeSource}, Date: {c.newNodeDate})\n"
                f"  Status: {c.status} ({c.relationship})"
            )

    # ── PRIMARY answer path: the hosted Cognee Cloud graph completion ──
    # This is a Cognee-first project: recall() answers straight from the graph.
    # The LLM providers (Groq / Gemini) are only used as a fallback below.
    answer = ""
    answered_by_cognee = False

    if cognee_cloud_active():
        from cognee_cloud import get_cloud_client
        client = get_cloud_client()
        if client:
            # 1) Ask Cognee to complete an answer over the knowledge graph (primary).
            try:
                completions = await client.recall(
                    req.query, get_cognee_dataset(), top_k=5,
                    only_context=False, search_type="GRAPH_COMPLETION",
                )
                cognee_answer = " ".join(t.strip() for t in completions if t and t.strip()).strip() if completions else ""
                refusal_markers = ["no context", "no information", "i don't know", "cannot answer", "not enough information"]
                if cognee_answer and len(cognee_answer) > 2 and not any(m in cognee_answer.lower() for m in refusal_markers):
                    answer = cognee_answer
                    answered_by_cognee = True
                    log_cognee_activity("recall()", f"[Cloud] Answered '{req.query[:45]}...' via graph completion")
            except Exception as cloud_err:
                print(f"[Cognee Cloud] graph completion failed ({cloud_err})", flush=True)

            # 2) If Cognee did not answer, pull raw context to ground the LLM fallback.
            if not answered_by_cognee:
                try:
                    texts = await client.recall(req.query, get_cognee_dataset(), top_k=5, only_context=True)
                    if texts:
                        log_cognee_activity("recall()", f"[Cloud] Recalled context for '{req.query[:45]}...'")
                        graph_ctx_lines.append("\n[Cognee Cloud Recall:]")
                        for t in texts:
                            graph_ctx_lines.append(f"- {t[:300]}")
                except Exception as cloud_err:
                    print(f"[Cognee Cloud] recall failed ({cloud_err})", flush=True)
    elif COGNEE_READY:
        apply_cognee_llm_config()
        try:
            cognee_results = await cognee.recall(
                query_text=req.query,
                datasets=[get_cognee_dataset()],
                only_context=True,
                top_k=5,
            )
            log_cognee_activity("recall()", f"Recalled context matching: '{req.query[:45]}...'")
            graph_ctx_lines.append("\n[Cognee Graph Search Results:]")
            for r in cognee_results:
                graph_ctx_lines.append(f"- {str(r)[:200]}")
        except Exception as cognee_err:
            print(f"[Cognee] recall failed: {cognee_err}", flush=True)

    # ── FALLBACK path: local LLM (Groq / Gemini), grounded on the graph context ──
    if not answered_by_cognee:
        if HAS_LLM:
            sys_prompt = (
                "You are Engram, an AI knowledge-graph assistant. "
                "You have access to the user's knowledge graph context below. "
                "When the user asks about their knowledge, sources, or project details, "
                "answer based on the provided knowledge graph context. Be specific: "
                "quote or paraphrase actual content. "
                "When the user sends a greeting, general chat, or asks something unrelated "
                "to the knowledge graph, respond naturally and conversationally. "
                "You are a helpful assistant that can do both, you do not need to force "
                "every answer to come from the knowledge graph."
            )
            user_prompt = (
                f"The following is the user's knowledge graph context:\n"
                f"{chr(10).join(graph_ctx_lines)}\n\n"
                f"User message: {req.query}"
            )
            llm_answer = await call_llm(user_prompt, system_prompt=sys_prompt)
        else:
            llm_answer = ""

        if not llm_answer:
            if not db_sources:
                answer = "I don't have any sources ingested yet. Please add a source under 'Add Memory' to ask questions about your knowledge graph."
            else:
                source_labels = ", ".join(f"'{s.label}'" for s in db_sources)
                answer = f"I've searched your active sources ({source_labels}) but couldn't find specific information to answer your question. Could you rephrase it or check the source content?"
        else:
            answer = llm_answer

    # If the LLM returned "don't know" but we have relevant data in context, build answer directly
    # We only override the LLM response if it is a short refusal (e.g., under 180 characters).
    # If the LLM actually wrote a detailed explanation but included a caveat, we keep its conversational answer.
    ignorance_phrases = ["don't have", "no information", "no context", "couldn't find", "not mentioned", "not enough", "don't know", "cannot determine", "doesn't contain"]
    is_refusal = (not answered_by_cognee) and len(answer.strip()) < 180 and any(p in answer.lower() for p in ignorance_phrases)
    if is_refusal:
        query_terms = extract_query_terms(req.query)
        matched_topic = get_matched_topic(req.query, db_get_distinct_topics())
        
        # Check if any sources match the query terms
        matched_sources = []
        if query_terms:
            for s in db_sources:
                if any(term in s.label.lower() or (s.url and term in s.url.lower()) for term in query_terms):
                    matched_sources.append(s)

        if matched_topic:
            relevant_conflicts = [c for c in db_conflicts if c.topic.lower() == matched_topic.lower()]
            if relevant_conflicts:
                parts = []
                for c in relevant_conflicts:
                    if c.relationship == "supersedes":
                        parts.append(f"On the topic of **{c.topic}**, the old belief was \"{c.oldNodeSummary}\". This was superseded by the new decision \"{c.newNodeSummary}\".")
                    else:
                        parts.append(f"On **{c.topic}**, there is a conflict between \"{c.oldNodeSummary}\" and \"{c.newNodeSummary}\".")
                answer = ("Based on your knowledge graph, here's what I found:\n\n" + "\n\n".join(parts) +
                          f"\n\nThese changes were detected automatically by Engram under the topic **{matched_topic}**.")
            else:
                answer = f"I couldn't find any tracked conflicts or history for the topic **{matched_topic}**."
        elif matched_sources:
            parts = []
            for s in matched_sources[:3]:
                raw = db_get_source_content(s.label)
                snippet = raw.strip()[:4000] if raw else ""
                if snippet:
                    parts.append(f"**{s.label}**:\n{snippet}...")
            if parts:
                answer = ("Based on your knowledge graph, here's what I found about this source:\n\n" +
                          "\n\n".join(parts) +
                          "\n\n*This information was extracted from the source content you ingested.*")
            else:
                answer = f"I found the matching source '{matched_sources[0].label}', but it doesn't contain text details matching your query."
        else:
            available_topics = db_get_distinct_topics()
            if available_topics:
                topics_str = ", ".join(f"**{t}**" for t in available_topics)
                answer = f"I couldn't find any information about that in your knowledge graph. Currently, I am tracking changes for these topics: {topics_str}."
            else:
                answer = "I don't have any tracked topics or decisions in the database yet. Please ingest a source under 'Add Memory' to start."

    # Build structured data from real reconciliation_log and confidence_history
    matched_source_labels = set()
    for line in graph_ctx_lines:
        if line.startswith("- Source "):
            m = re.match(r'- Source "([^"]+)"', line)
            if m:
                matched_source_labels.add(m.group(1))

    # Only show source pills if we actually found relevant sources for the answer
    has_no_info = any(phrase in answer.lower() for phrase in ["no information", "no context", "don't have", "couldn't find", "not mentioned", "any sources ingested yet"])
    if not matched_source_labels and db_sources and not has_no_info:
        matched_source_labels = {s.label for s in db_sources[:1]}

    sources_list = [SourcePill(label=s.label, type=s.type) for s in db_sources if s.label in matched_source_labels]

    diff_card: Optional[DiffCard] = None
    timeline_list: Optional[list[TimelinePoint]] = None
    connection_map: Optional[ConnectionMap] = None

    if intent == "what_changed":
        matched_topic = get_matched_topic(query, db_get_distinct_topics())
        if matched_topic:
            db_recon_log = db_get_reconciliation_log(matched_topic)
        else:
            db_recon_log = []
        added = [e.newSummary for e in db_recon_log if e.eventType == "added" and e.newSummary]
        removed = [e.oldSummary for e in db_recon_log if e.eventType == "removed" and e.oldSummary]
        changed = [(e.oldSummary or "", e.newSummary or "") for e in db_recon_log if e.eventType == "changed" and e.oldSummary and e.newSummary]
        decisions = [e.newSummary for e in db_recon_log if e.eventType == "new_decision" and e.newSummary]
        
        # Only attach diff card if there is actual historical data for the matched topic
        if added or removed or changed or decisions:
            topic_label = matched_topic if matched_topic else "recorded changes"
            diff_card = DiffCard(
                topic=topic_label, sinceDate="Earliest recorded change",
                added=added, removed=removed, changed=changed, newDecisions=decisions,
            )
    elif intent == "temporal_belief":
        matched_topic = get_matched_topic(query, db_get_timeline_topics())
        if matched_topic:
            db_history = db_get_confidence_history(matched_topic)
            if db_history:
                timeline_list = [
                    TimelinePoint(date=h.date, valueSummary=h.valueSummary, confidenceScore=h.confidenceScore, reason=h.reason)
                    for h in sorted(db_history, key=lambda x: x.date)
            ]
    elif intent == "cross_correlation":
        matched_topic = get_matched_topic(query, db_get_distinct_topics())
        if matched_topic:
            connections = []
            matched_conflicts = [c for c in db_conflicts if c.topic.lower() == matched_topic.lower()]
            matched_sources = set()
            matched_dates = set()
            for c in matched_conflicts:
                matched_sources.add(c.oldNodeSource.lower())
                matched_sources.add(c.newNodeSource.lower())
                matched_dates.add(c.oldNodeDate)
                matched_dates.add(c.newNodeDate)
                
            seen_connected_topics = set()
            for c in db_conflicts:
                if c.topic.lower() == matched_topic.lower():
                    continue
                if c.topic.lower() in seen_connected_topics:
                    continue
                    
                if c.oldNodeSource.lower() in matched_sources or c.newNodeSource.lower() in matched_sources:
                    shared_src = c.oldNodeSource if c.oldNodeSource.lower() in matched_sources else c.newNodeSource
                    connections.append(ConnectionItem(
                        nodeLabel=c.topic,
                        type="shared_source",
                        description=f"Both '{matched_topic}' and '{c.topic}' reference the shared source document '{shared_src}'."
                    ))
                    seen_connected_topics.add(c.topic.lower())
                    continue
                    
                if c.oldNodeDate in matched_dates or c.newNodeDate in matched_dates:
                    shared_date = c.oldNodeDate if c.oldNodeDate in matched_dates else c.newNodeDate
                    connections.append(ConnectionItem(
                        nodeLabel=c.topic,
                        type="temporal_proximity",
                        description=f"Decisions on '{matched_topic}' and '{c.topic}' were both recorded on the same date: {shared_date}."
                    ))
                    seen_connected_topics.add(c.topic.lower())
                    continue
                    
                matched_words = set(extract_query_terms(c.newNodeSummary) + extract_query_terms(c.oldNodeSummary))
                topic_words = set()
                for mc in matched_conflicts:
                    topic_words.update(extract_query_terms(mc.newNodeSummary) + extract_query_terms(mc.oldNodeSummary))
                
                common_words = matched_words.intersection(topic_words)
                if common_words:
                    word_str = ", ".join(f"'{w}'" for w in list(common_words)[:2])
                    connections.append(ConnectionItem(
                        nodeLabel=c.topic,
                        type="semantic_link",
                        description=f"Both topics share semantic context related to {word_str} in their belief statements."
                    ))
                    seen_connected_topics.add(c.topic.lower())
                    
            if connections:
                connection_map = ConnectionMap(
                    topic=matched_topic,
                    connections=connections[:4]
                )

    # Remember the chat turn in Cognee memory. We mint our own qa_id (uuid) so
    # feedback can attach without loading the heavy local SDK session store just
    # to read one back, which was pushing the free-tier instance over its RAM cap.
    qa_id_val: Optional[str] = "qa_" + str(uuid.uuid4())[:12]
    provider_val: Optional[str] = None
    model_val: Optional[str] = None
    try:
        _sid = get_session_id()
        await remember_chat_turn(
            session_id=_sid,
            question=req.query,
            answer=answer,
            context=json.dumps([s.label for s in sources_list]),
        )
        # Attribute the answer: Cognee when it answered from the graph, otherwise the fallback LLM.
        if answered_by_cognee:
            provider_val = "cognee"
            model_val = "graph-completion"
        else:
            config = db_get_user_ai_config()
            if config:
                provider_val = config.get("provider")
                model_val = config.get("model", "").split("/")[-1] or config.get("model")
            elif GEMINI_API_KEY:
                provider_val = "gemini"
                model_val = GEMINI_MODEL
            elif GROQ_API_KEY:
                provider_val = "groq"
                model_val = GROQ_MODEL
    except Exception:
        pass

    return ChatMessage(
        id=msg_id, query=req.query, intent=intent,
        answer=answer,
        sources=sources_list,
        diffCard=diff_card,
        timeline=timeline_list,
        connectionMap=connection_map,
        timestamp=datetime.now(timezone.utc).isoformat(),
        qa_id=qa_id_val,
        provider=provider_val,
        model=model_val,
    )


def _graph_node_text(n: dict) -> str:
    """Human-readable text for a graph node (Fact/Decision/Topic)."""
    props = n.get("properties") or {}
    for k in ("statement", "name", "description", "title"):
        v = props.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    label = n.get("label")
    return label.strip() if isinstance(label, str) and label.strip() else ""


async def reconcile_from_graph() -> int:
    """Read `supersedes` / `contradicts` edges straight from the Cognee graph and
    turn them into ConflictEvents. This makes Cognee itself the contradiction
    detector (the LLM pass in run_reconciliation becomes a secondary detector),
    and makes the typed ontology visibly pay off in the /resolve inbox.
    Returns the number of new conflicts created."""
    if not cognee_cloud_active():
        return 0
    from cognee_cloud import get_cloud_client
    client = get_cloud_client()
    if not client:
        return 0
    try:
        ds_id = await client.dataset_id_for(get_cognee_dataset())
        if not ds_id:
            return 0
        g = await client.dataset_graph(ds_id)
    except Exception as e:
        print(f"[Cognee Cloud] reconcile_from_graph fetch failed ({e})", flush=True)
        return 0
    if not isinstance(g, dict):
        return 0

    nodes = {str(n.get("id")): n for n in g.get("nodes", [])}
    edges = g.get("edges", []) or []
    domain_types = {"Fact", "Decision", "Topic", "Entity", "Source"}

    # Map each node to its topic via its about_topic edge (nicer conflict topics).
    topic_of: dict[str, str] = {}
    for e in edges:
        if (e.get("label") or "").lower() == "about_topic":
            tgt = nodes.get(str(e.get("target")))
            if tgt:
                topic_of[str(e.get("source"))] = _graph_node_text(tgt)

    existing = db_get_conflicts(include_resolved=True)
    seen = {(c.topic, c.oldNodeSummary, c.newNodeSummary) for c in existing}
    now = datetime.now(timezone.utc).isoformat()
    created = 0

    for e in edges:
        label = (e.get("label") or "").lower()
        is_supersede = "supersede" in label
        is_contradict = "contradict" in label
        if not (is_supersede or is_contradict):
            continue
        src = nodes.get(str(e.get("source")))
        tgt = nodes.get(str(e.get("target")))
        if not src or not tgt:
            continue
        if src.get("type") not in domain_types or tgt.get("type") not in domain_types:
            continue
        # supersedes: source supersedes target -> source is the new/current claim.
        new_summary = _graph_node_text(src)
        old_summary = _graph_node_text(tgt)
        if not new_summary or not old_summary or new_summary == old_summary:
            continue
        topic = topic_of.get(str(e.get("source"))) or topic_of.get(str(e.get("target"))) or new_summary[:60]
        key = (topic, old_summary, new_summary)
        if key in seen:
            continue
        seen.add(key)
        db_save_conflict(ConflictEvent(
            id="cg_" + str(uuid.uuid4())[:10],
            oldNodeSummary=old_summary, oldNodeDate=now, oldNodeSource="Cognee graph",
            newNodeSummary=new_summary, newNodeDate=now, newNodeSource="Cognee graph",
            topic=topic, relationship=("supersedes" if is_supersede else "contradicts"),
            llmConfidence=0.85, status="pending", resolutionNote=None, createdAt=now,
        ))
        created += 1

    if created:
        log_cognee_activity("recall()", f"[Cloud] Detected {created} contradiction(s) from the graph")
    return created


async def get_conflict_events() -> list[ConflictEvent]:
    # Refresh graph-derived contradictions periodically (cached ~45s) so Cognee
    # itself drives the reconciliation inbox, not only the side-channel LLM pass.
    if cognee_cloud_active() and memory_cache.get(_cache_key("graph_reconcile")) is None:
        memory_cache.set(_cache_key("graph_reconcile"), True, ttl=120)
        try:
            await reconcile_from_graph()
        except Exception as e:
            print(f"[Cognee Cloud] graph reconcile error ({e})", flush=True)
    return db_get_conflicts(include_resolved=True)


async def resolve_conflict(req: ResolveRequest) -> None:
    db_conflicts = db_get_conflicts(include_resolved=True)
    for c in db_conflicts:
        if c.id == req.eventId:
            c.status = f"resolved_{req.resolution}"  # type: ignore
            c.resolutionNote = req.note
            db_save_conflict(c)

            # Log to reconciliation_log so the diff card reflects it
            now = datetime.now(timezone.utc).isoformat()
            log_id = "log_" + str(uuid.uuid4())[:8]
            
            if req.resolution == "keep_new":
                db_save_reconciliation_log_entry(ReconciliationLogEntry(
                    id=log_id, eventType="changed", topic=c.topic,
                    oldSummary=c.oldNodeSummary, newSummary=c.newNodeSummary,
                    source=c.newNodeSource, createdAt=now,
                ))
                # Update confidence history
                db_save_confidence_history_entry(ConfidenceHistoryEntry(
                    id="ch_" + str(uuid.uuid4())[:8], topic=c.topic,
                    valueSummary=c.newNodeSummary, confidenceScore=0.95,
                    reason="reinforced", date=now
                ))
                db_save_confidence_history_entry(ConfidenceHistoryEntry(
                    id="ch_" + str(uuid.uuid4())[:8], topic=c.topic,
                    valueSummary=c.oldNodeSummary, confidenceScore=0.10,
                    reason="superseded", date=now
                ))
                # Forget the old superseded claim in Cognee (cloud-first).
                await _forget_claims([c.oldNodeSummary], c.topic)
            elif req.resolution == "keep_old":
                db_save_reconciliation_log_entry(ReconciliationLogEntry(
                    id=log_id, eventType="removed", topic=c.topic,
                    oldSummary=c.newNodeSummary, createdAt=now,
                ))
                # Update confidence history
                db_save_confidence_history_entry(ConfidenceHistoryEntry(
                    id="ch_" + str(uuid.uuid4())[:8], topic=c.topic,
                    valueSummary=c.oldNodeSummary, confidenceScore=0.92,
                    reason="reinforced", date=now
                ))
                db_save_confidence_history_entry(ConfidenceHistoryEntry(
                    id="ch_" + str(uuid.uuid4())[:8], topic=c.topic,
                    valueSummary=c.newNodeSummary, confidenceScore=0.10,
                    reason="superseded", date=now
                ))
                # Forget the new rejected claim in Cognee (cloud-first).
                await _forget_claims([c.newNodeSummary], c.topic)
            elif req.resolution == "keep_both":
                db_save_reconciliation_log_entry(ReconciliationLogEntry(
                    id=log_id, eventType="added", topic=c.topic,
                    newSummary=f"{c.newNodeSummary} (coexists with {c.oldNodeSummary})",
                    source=c.newNodeSource, createdAt=now,
                ))
                # Update confidence history
                db_save_confidence_history_entry(ConfidenceHistoryEntry(
                    id="ch_" + str(uuid.uuid4())[:8], topic=c.topic,
                    valueSummary=c.oldNodeSummary, confidenceScore=0.90,
                    reason="reinforced", date=now
                ))
                db_save_confidence_history_entry(ConfidenceHistoryEntry(
                    id="ch_" + str(uuid.uuid4())[:8], topic=c.topic,
                    valueSummary=c.newNodeSummary, confidenceScore=0.90,
                    reason="reinforced", date=now
                ))
            return


async def _forget_claims(summaries: list[str], topic: str) -> None:
    """Prune claims from whichever backend is active. On Cloud we resolve each
    claim to a tenant data item and forget it by dataId (best-effort name match);
    this is what lets decay sweeps and reconciliation reach the hosted graph
    rather than only the local store. Never forgets the whole dataset."""
    if cognee_cloud_active():
        from cognee_cloud import get_cloud_client
        client = get_cloud_client()
        if client:
            try:
                ds_id = await client.dataset_id_for(get_cognee_dataset())
                pruned = 0
                if ds_id:
                    for s in summaries:
                        if not s:
                            continue
                        data_id = await client.data_id_for(ds_id, s)
                        if data_id:
                            await client.forget(data_id=data_id)
                            pruned += 1
                if pruned:
                    log_cognee_activity("forget()", f"[Cloud] Pruned {pruned} item(s) for '{topic}'")
                else:
                    log_cognee_activity("forget()", f"[Cloud] No matching data item for '{topic}' (claim-level prune is best-effort); skipped")
                return
            except Exception as e:
                print(f"[Cognee Cloud] claim forget failed ({e}); trying local SDK.", flush=True)
    if COGNEE_READY:
        apply_cognee_llm_config()
        try:
            for s in summaries:
                if s:
                    await cognee.forget(data_id=s, dataset=get_cognee_dataset())
            log_cognee_activity("forget()", f"Pruned stale claims on '{topic}'")
        except Exception as err:
            print(f"[Cognee] claim forget failed for {topic}: {err}", flush=True)


async def run_decay_check(user_id: str = "") -> DecayResult:
    if user_id:
        set_current_user(user_id)
    memory_cache.invalidate(_cache_key("graph_snapshot"))
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    decayed = 0
    forgotten = 0
    
    settings = db_get_decay_settings()
    db_conflicts = db_get_conflicts(include_resolved=True, user_id=user_id)
    
    all_history = db_get_confidence_history(user_id=user_id)
    history_by_topic: dict[str, list] = {}
    for entry in all_history:
        history_by_topic.setdefault(entry.topic, []).append(entry)
    
    for c in db_conflicts:
        if c.status == "forgotten":
            continue
        
        # Compute time elapsed since the conflict was created
        try:
            raw = c.createdAt.replace("Z", "+00:00")
            created = datetime.fromisoformat(raw)
        except (ValueError, TypeError):
            created = now_dt
        days_since = max(0, (now_dt - created).days)
        
        # Get original confidence from confidence history (first entry for this topic)
        history = history_by_topic.get(c.topic, [])
        original_entry = history[0] if history else None
        original_confidence = original_entry.confidenceScore if original_entry else c.llmConfidence
        
        # Compute time-proportional decay
        if days_since <= settings.decayStartDays:
            new_confidence = original_confidence
        elif days_since >= settings.forgetThresholdDays:
            new_confidence = 0.0
        else:
            decay_ratio = (days_since - settings.decayStartDays) / (settings.forgetThresholdDays - settings.decayStartDays)
            new_confidence = max(0.0, round(original_confidence * (1 - decay_ratio), 2))
        
        c.llmConfidence = new_confidence
        
        if new_confidence < 0.20:
            c.status = "forgotten"
            forgotten += 1
            await _forget_claims([c.oldNodeSummary, c.newNodeSummary], c.topic)
        elif new_confidence < original_confidence:
            decayed += 1
        
        db_save_conflict(c)
        
        ch_id = "ch_" + str(uuid.uuid4())[:8]
        db_save_confidence_history_entry(ConfidenceHistoryEntry(
            id=ch_id, topic=c.topic,
            valueSummary=c.newNodeSummary, confidenceScore=new_confidence,
            reason="decay_tick", date=now,
        ))
        
    return DecayResult(forgotten=forgotten, decayed=decayed)


async def run_decay_all_users() -> dict:
    """Run the decay tick for every user that owns reconcilable memory.

    Called by the scheduled maintenance cron (no single user in context), so it
    fans out per user rather than decaying only the caller's data. The current
    user context is preserved and restored around the sweep so a foreground
    request that happens to trigger this is not left pointing at another user.
    """
    saved_user = get_current_user()
    users = db_get_distinct_users()
    total_forgotten = 0
    total_decayed = 0
    processed = 0
    try:
        for uid in users:
            try:
                result = await run_decay_check(user_id=uid)
                total_forgotten += result.forgotten
                total_decayed += result.decayed
                processed += 1
            except Exception as e:
                print(f"[Decay] sweep failed for user {uid[:8]}...: {e}", flush=True)
    finally:
        # Restore whatever context we started with (empty string is fine).
        set_current_user(saved_user)
    log_cognee_activity("decay()", f"Scheduled sweep: {processed} user(s), {total_forgotten} forgotten, {total_decayed} decayed")
    return {
        "users": processed,
        "forgotten": total_forgotten,
        "decayed": total_decayed,
    }


async def get_decay_settings() -> DecaySettings:
    return db_get_decay_settings()


async def update_decay_settings(settings: DecaySettings) -> None:
    db_update_decay_settings(settings)


async def run_memory_improve() -> dict:
    """
    First-class improve()/memify operation. Re-runs post-ingestion enrichment
    over the active dataset — routes to the hosted tenant (re-cognify) when
    connected, otherwise SDK memify locally.
    """
    dataset = get_cognee_dataset()
    memory_cache.invalidate(_cache_key("graph_snapshot"))
    memory_cache.invalidate(_cache_key("schema_inventory"))

    if cognee_cloud_active():
        from cognee_cloud import get_cloud_client
        client = get_cloud_client()
        if client:
            try:
                await client.improve(dataset, run_in_background=True)
                log_cognee_activity("improve()", f"[Cloud] Re-enriching dataset '{dataset}' (memify)")
                return {"status": "ok", "backend": "cloud", "dataset": dataset}
            except Exception as e:
                print(f"[Cognee Cloud] improve failed ({e}); trying local memify.", flush=True)

    if COGNEE_READY:
        apply_cognee_llm_config()
        try:
            await asyncio.wait_for(cognee.memify(dataset=dataset), timeout=30.0)
            log_cognee_activity("memify()", f"Re-indexed concepts & relations for '{dataset}'")
            return {"status": "ok", "backend": "local", "dataset": dataset}
        except asyncio.TimeoutError:
            log_cognee_activity("memify()", f"memify running in background for '{dataset}'")
            return {"status": "ok", "backend": "local", "dataset": dataset}
        except Exception as e:
            print(f"[Cognee] memify failed: {e}", flush=True)
            return {"status": "error", "backend": "local", "error": str(e)}

    return {"status": "error", "error": "No memory backend available"}


async def get_sources() -> list[Source]:
    cached = memory_cache.get(_cache_key("sources"))
    if cached is not None:
        return cached
    result = db_get_sources()
    memory_cache.set(_cache_key("sources"), result, ttl=30)
    return result


async def generate_node_summary(node_id: str, label: str, source: str) -> str:
    if not HAS_LLM:
        return ""
    prompt = (
        f"Infer what this knowledge graph node likely represents based on its name and origin:\n\n"
        f"Name: {label}\n"
        f"Origin: {source}\n\n"
        f"Write ONE short sentence describing what this node contributes or means. "
        f"DO NOT rephrase the name and origin literally. DO NOT start with 'This node represents'."
    )
    result = await call_llm(prompt, "You are a precise knowledge graph assistant.")
    return result.strip().strip('"').strip("'")


async def search_nodes(query: str) -> list[NodeSearchResult]:
    q = query.lower()
    results = []
    db_conflicts = db_get_conflicts(include_resolved=True)
    for c in db_conflicts:
        if q in c.topic.lower() or q in c.oldNodeSummary.lower() or q in c.newNodeSummary.lower():
            results.append(NodeSearchResult(id=f"node_{c.id}_new", label=c.newNodeSummary[:40], confidence=c.llmConfidence, status=c.status))
    return results


async def forget_node(node_id: str) -> dict:
    """Prune a single node, cloud-first (consistent with every other lifecycle
    op) with a local SDK fallback. Returns an honest status so the caller knows
    whether the prune actually happened."""
    result = {"status": "ok", "backend": "none", "pruned": False}
    # Cloud-first: resolve the node to a tenant data item and forget it.
    if cognee_cloud_active():
        from cognee_cloud import get_cloud_client
        client = get_cloud_client()
        if client:
            try:
                ds_id = await client.dataset_id_for(get_cognee_dataset())
                data_id = await client.data_id_for(ds_id, node_id) if ds_id else None
                if data_id:
                    await client.forget(dataset_name=get_cognee_dataset(), data_id=data_id)
                    result.update(backend="cloud", pruned=True)
                    log_cognee_activity("forget()", f"[Cloud] Pruned node '{node_id[:20]}' from tenant")
                else:
                    result.update(backend="cloud", status="skipped")
                    log_cognee_activity("forget()", f"[Cloud] Could not resolve node '{node_id[:20]}'; skipped")
                memory_cache.invalidate(_cache_key("graph_snapshot"))
                return result
            except Exception as e:
                print(f"[Cognee Cloud] forget node failed ({e}); trying local SDK.", flush=True)
    if COGNEE_READY:
        apply_cognee_llm_config()
        try:
            await cognee.forget(data_id=node_id, dataset=get_cognee_dataset())
            result.update(backend="local", pruned=True)
            log_cognee_activity("forget()", f"Pruned node ID '{node_id[:20]}' from graph")
        except Exception as cognee_err:
            result["status"] = "error"
            print(f"[Cognee] forget failed: {cognee_err}", flush=True)
    memory_cache.invalidate(_cache_key("graph_snapshot"))
    return result


async def forget_source(source_id: str) -> dict:
    """Remove a source from the user's list and prune it from the memory backend.
    Attempts the backend prune first (cloud-first), then always removes the local
    record so the user's delete intent is honored, and reports an honest status."""
    db_sources = db_get_sources()
    target_source = next((s for s in db_sources if s.id == source_id), None)
    if not target_source:
        return {"status": "not_found", "backend": "none", "pruned": False}

    result = {"status": "ok", "backend": "none", "pruned": False}
    # Attempt to prune from the active memory backend before removing locally.
    if cognee_cloud_active():
        from cognee_cloud import get_cloud_client
        client = get_cloud_client()
        if client:
            try:
                # Prefer the exact data-item UUID stored at ingest; only fall back
                # to name resolution for older sources ingested before this existed.
                data_id = db_get_source_cognee_id(source_id)
                if not data_id:
                    ds_id = await client.dataset_id_for(get_cognee_dataset())
                    if ds_id:
                        data_id = await client.data_id_for(ds_id, f"engram_{source_id}.md")
                        if not data_id:
                            data_id = await client.data_id_for(ds_id, target_source.label)
                if data_id:
                    await client.forget(dataset_name=get_cognee_dataset(), data_id=data_id)
                    result.update(backend="cloud", pruned=True)
                    log_cognee_activity("forget()", f"[Cloud] Pruned '{target_source.label}' from tenant")
                else:
                    result.update(backend="cloud", status="skipped")
                    log_cognee_activity("forget()", f"[Cloud] Could not resolve '{target_source.label}' on tenant; skipped")
            except Exception as e:
                result["status"] = "error"
                print(f"[Cognee Cloud] forget failed ({e})", flush=True)
    elif COGNEE_READY:
        apply_cognee_llm_config()
        try:
            await cognee.forget(dataset=get_cognee_dataset(), data_id=target_source.label)
            result.update(backend="local", pruned=True)
            log_cognee_activity("forget()", f"Pruned source document '{target_source.label}'")
        except Exception as e:
            result["status"] = "error"
            print(f"[Cognee] forget source failed ({e})", flush=True)

    # Always honor the user's delete intent on the local source list.
    db_delete_source(source_id)
    memory_cache.invalidate(_cache_key("sources"))
    memory_cache.invalidate(_cache_key("graph_snapshot"))
    return result


def _sanitize_provenance_html(html: str) -> str:
    """Guard the third-party Cognee provenance HTML before it is rendered in an
    iframe. The upstream visualization template references an undeclared variable
    (for example `built`) inside its Memory View handler, which throws
    `ReferenceError: built is not defined` on click, especially when the graph is
    still empty. We cannot edit their template, so we inject a defensive shim that
    provides a safe fallback and swallows that specific ReferenceError so the
    control degrades gracefully instead of crashing."""
    if not html or not isinstance(html, str):
        return html
    shim = (
        "<script>(function(){"
        "if(typeof window.built==='undefined'){window.built={nodes:[],edges:[],links:[]};}"
        "window.addEventListener('error',function(e){"
        "if(e&&e.message&&/is not defined/.test(e.message)){e.preventDefault();return true;}"
        "});"
        "})();</script>"
    )
    lowered = html.lower()
    idx = lowered.find("<head>")
    if idx != -1:
        pos = idx + len("<head>")
        return html[:pos] + shim + html[pos:]
    idx = lowered.find("<body")
    if idx != -1:
        pos = html.find(">", idx)
        if pos != -1:
            return html[: pos + 1] + shim + html[pos + 1 :]
    return shim + html


async def get_memory_provenance_html() -> str:
    if cognee_cloud_active():
        from cognee_cloud import get_cloud_client
        client = get_cloud_client()
        if client:
            try:
                html = await client.provenance_html(include_memory=True)
                if html and isinstance(html, str) and html.strip():
                    log_cognee_activity("visualize_memory_provenance()", "[Cloud] Generated provenance HTML")
                    return _sanitize_provenance_html(html)
            except Exception as e:
                print(f"[Cognee Cloud] provenance failed ({e})", flush=True)
    if not COGNEE_READY:
        return "<html><body style='font-family:sans-serif;padding:2rem'><h2>Cognee Not Configured</h2><p>Set GEMINI_API_KEY or GROQ_API_KEY to generate provenance visualization.</p></body></html>"
    apply_cognee_llm_config()
    try:
        html = await cognee.visualize_memory_provenance(include_memory=True)
        log_cognee_activity("visualize_memory_provenance()", "Generated memory provenance HTML")
        return _sanitize_provenance_html(html)
    except Exception as e:
        log_cognee_activity("visualize_memory_provenance_error", str(e))
        return f"<html><body style='font-family:sans-serif;padding:2rem'><h2>Provenance Error</h2><p>{e}</p></body></html>"


async def get_schema_inventory_data() -> list[dict]:
    cached = memory_cache.get(_cache_key("schema_inventory"))
    if cached is not None:
        return cached
    if cognee_cloud_active():
        from cognee_cloud import get_cloud_client
        client = get_cloud_client()
        if client:
            try:
                ds_id = await client.dataset_id_for(get_cognee_dataset())
                if ds_id:
                    result = await client.schema_inventory(ds_id, samples_per_type=3)
                    log_cognee_activity("get_schema_inventory()", f"[Cloud] Retrieved {len(result)} entity types")
                    memory_cache.set(_cache_key("schema_inventory"), result, ttl=60)
                    return result
            except Exception as e:
                print(f"[Cognee Cloud] schema inventory failed ({e})", flush=True)
    if not COGNEE_READY:
        return []
    apply_cognee_llm_config()
    try:
        result = await cognee.get_schema_inventory(dataset=get_cognee_dataset(), samples_per_type=3)
        log_cognee_activity("get_schema_inventory()", f"Retrieved {len(result)} entity types")
        memory_cache.set(_cache_key("schema_inventory"), result, ttl=60)
        return result
    except Exception as e:
        log_cognee_activity("get_schema_inventory_error", str(e))
        return []


async def get_session_history(session_id: str = "default_session", last_n: int | None = 5) -> list[dict]:
    if not COGNEE_READY:
        return []
    apply_cognee_llm_config()
    try:
        entries = await cognee.session.get_session(session_id=session_id, last_n=last_n)
        return [
            {
                "qa_id": e.qa_id,
                "question": e.question,
                "answer": e.answer,
                "time": e.time,
                "feedback_score": e.feedback_score,
                "feedback_text": e.feedback_text,
            }
            for e in entries
        ]
    except Exception as e:
        log_cognee_activity("get_session_error", str(e))
        return []


def _guidance_from_metadata(session_id: str = "default_session") -> dict:
    """Build lightweight, real "Engram has noticed" insights from the per-user
    reconciliation log and pending conflicts. Used on the Cloud path where SDK
    session distillation is unavailable."""
    documents: list[str] = []
    try:
        conflicts = db_get_conflicts(include_resolved=True)
        pending = [c for c in conflicts if c.status == "pending"]
        resolved = [c for c in conflicts if c.status.startswith("resolved")]
        if pending:
            top = pending[0]
            documents.append(
                f"{len(pending)} contradiction{'s' if len(pending) != 1 else ''} awaiting review, "
                f"e.g. \"{top.topic}\": {top.newNodeSummary} vs {top.oldNodeSummary}."
            )
        for c in resolved[:2]:
            documents.append(
                f"Reconciled \"{c.topic}\": {c.newNodeSummary} now supersedes {c.oldNodeSummary}."
            )
        log = db_get_reconciliation_log()
        for entry in log[:2]:
            if entry.newSummary:
                documents.append(f"Recent update on \"{entry.topic}\": {entry.newSummary}.")
    except Exception as e:
        log_cognee_activity("guidance_metadata_error", str(e))
    return {
        "session_id": session_id,
        "status": "ok" if documents else "empty",
        "documents": documents[:3],
    }


async def get_session_guidance(session_id: str = "default_session") -> dict:
    if not COGNEE_READY:
        return {"goals": [], "rules": [], "preferences": [], "lessons_learned": []}
    # Nothing ingested yet means the per-user dataset does not exist on the tenant,
    # so distillation would 422. Skip quietly until there is something to distill.
    if not db_get_sources():
        return {"session_id": session_id, "status": "empty", "documents": []}
    # Session distillation uses the local SDK session store. Under a hosted Cognee
    # Cloud tenant, dataset ownership differs with multi-tenant access control, so
    # distill_session 422s. Instead of showing nothing, derive real guidance from
    # the reconciliation log and pending conflicts we already track per user.
    if cognee_cloud_active():
        return _guidance_from_metadata(session_id)
    apply_cognee_llm_config()
    try:
        result = await cognee.session.distill_session(
            session_id=session_id,
            dataset=get_cognee_dataset(),
        )
        return {
            "session_id": result.session_id,
            "status": result.status,
            "documents": result.documents,
        }
    except Exception as e:
        log_cognee_activity("distill_session_error", str(e))
        return {"session_id": session_id, "status": "error", "documents": []}


async def add_session_feedback(session_id: str, qa_id: str, feedback_text: str | None = None, feedback_score: int | None = None) -> bool:
    # Cloud-first deploy: persist feedback to the lightweight metadata table so we
    # never load the heavy local SDK just to record a thumbs-up/down.
    if cognee_cloud_active():
        try:
            await asyncio.to_thread(db_save_qa_feedback, qa_id, feedback_score, feedback_text)
            return True
        except Exception as e:
            log_cognee_activity("add_feedback_error", str(e))
            return False
    if not COGNEE_READY:
        return False
    apply_cognee_llm_config()
    try:
        return await cognee.session.add_feedback(
            session_id=session_id,
            qa_id=qa_id,
            feedback_text=feedback_text,
            feedback_score=feedback_score,
        )
    except Exception as e:
        log_cognee_activity("add_feedback_error", str(e))
        return False


async def remember_chat_turn(session_id: str, question: str, answer: str, context: str = "") -> bool:
    """Persist a completed conversation turn as durable memory, so a future
    session can recall what was discussed. On Cloud the turn is written into the
    knowledge graph (typed), which is what makes "remembers every conversation
    across infinite sessions" true rather than aspirational."""
    ok = False

    # 1) Write the turn into the hosted graph so it is recallable across sessions.
    if cognee_cloud_active():
        from cognee_cloud import get_cloud_client
        client = get_cloud_client()
        if client:
            try:
                from graph_model import ENGRAM_GRAPH_MODEL, ENGRAM_CUSTOM_PROMPT
                now_dt = datetime.now(timezone.utc)
                stamp = now_dt.strftime("%Y-%m-%d")
                text = (
                    f"[Conversation on {stamp} | session {session_id}]\n"
                    f"Question: {question}\nAnswer: {answer}"
                )
                await client.ensure_dataset(get_cognee_dataset())
                # Unique per turn so each conversation data item resolves to a
                # distinct tenant id (a shared filename made data_id_for ambiguous).
                turn_stamp = now_dt.strftime("%Y%m%d-%H%M%S-%f")
                await client.remember(
                    text,
                    get_cognee_dataset(),
                    filename=f"conversation_{session_id}_{turn_stamp}.md",
                    graph_model=ENGRAM_GRAPH_MODEL,
                    custom_prompt=ENGRAM_CUSTOM_PROMPT,
                    run_in_background=True,
                )
                log_cognee_activity("remember()", f"[Cloud] Remembered conversation turn in session '{session_id}'")
                return True
            except Exception as e:
                print(f"[Cognee Cloud] remember chat turn failed ({e}); trying local SDK.", flush=True)

    # 2) Local SDK session store, only when Cloud is NOT the active backend.
    #    Invoking the local pipeline is memory-heavy (embedding/cognify), so we
    #    avoid it entirely on the cloud-first deployment.
    if COGNEE_READY:
        apply_cognee_llm_config()
        try:
            qa_entry = cognee.QAEntry(
                question=question,
                answer=answer,
                context=context,
            )
            await cognee.remember(
                data=qa_entry,
                session_id=session_id,
                dataset_name=get_cognee_dataset(),
            )
            log_cognee_activity("session_remember", f"Stored chat turn in session '{session_id}'")
            ok = True
        except Exception as e:
            log_cognee_activity("session_remember_error", str(e))

    return ok


async def import_chat_export(file_content: str, label: str = "Imported Chat") -> dict:
    """
    Parse and ingest an exported AI chat file.
    Supports ChatGPT format (conversations.json array) and Claude format (JSON with messages array).
    """
    imported_count = 0
    errors: list[str] = []

    try:
        data = json.loads(file_content)
    except json.JSONDecodeError as e:
        return {"status": "error", "error": f"Invalid JSON: {e}", "imported": 0, "errors": [str(e)]}

    conversations: list[dict] = []

    if isinstance(data, list):
        conversations = data
    elif isinstance(data, dict):
        if "conversations" in data:
            conversations = data["conversations"]
        elif "messages" in data:
            # Single Claude-style conversation
            conversations = [data]
        else:
            conversations = [data]

    if not isinstance(conversations, list):
        conversations = [conversations]

    for i, conv in enumerate(conversations):
        try:
            title = conv.get("title", conv.get("name", f"{label} #{i + 1}"))
            messages_list = conv.get("messages", conv.get("message", conv.get("chat_messages", [])))
            if isinstance(messages_list, str):
                messages_list = [messages_list]
            if not isinstance(messages_list, list):
                messages_list = [messages_list]

            parts: list[str] = []
            for msg in messages_list:
                if isinstance(msg, dict):
                    role = msg.get("role", msg.get("author", ""))
                    content = msg.get("content", msg.get("parts", msg.get("text", "")))
                    if isinstance(content, list):
                        content = " ".join(str(c) for c in content if isinstance(c, str))
                    if content:
                        parts.append(f"[{role}]: {content}")
                elif isinstance(msg, str):
                    parts.append(msg)

            if not parts:
                # Try alternate format: conversation has a "text" field
                text = conv.get("text", conv.get("content", ""))
                if text:
                    parts = [str(text)]

            if parts:
                content = "\n\n".join(parts)
                ingest_req = IngestRequest(
                    type="conversation",
                    content=content,
                    label=f"{title[:100]}",
                )
                await ingest_source(ingest_req)
                imported_count += 1
            else:
                errors.append(f"Conversation #{i + 1}: no parseable messages")
        except Exception as e:
            errors.append(f"Conversation #{i + 1}: {e}")

    return {
        "status": "ok" if imported_count > 0 else "error",
        "imported": imported_count,
        "errors": errors[:5],
        "total_found": len(conversations),
    }


def _detect_chat_platform(url: str) -> str:
    url_lower = url.lower()
    if "chatgpt.com" in url_lower or "chat.openai.com" in url_lower:
        return "chatgpt"
    if "gemini.google.com" in url_lower or "bard.google.com" in url_lower:
        return "gemini"
    if "claude.ai" in url_lower:
        return "claude"
    return "generic"


def _validate_url_safety(url: str) -> None:
    parsed = httpx.URL(url)
    if parsed.host is None:
        raise ValueError("URL has no host component")
    host = parsed.host
    try:
        addrs = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return
    for family, _, _, _, sockaddr in addrs:
        ip = sockaddr[0]
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            continue
        if addr.is_private or addr.is_loopback or addr.is_link_local:
            raise ValueError(f"Blocked request to private/internal IP: {ip}")
        if addr.is_multicast or addr.is_reserved:
            raise ValueError(f"Blocked request to reserved IP: {ip}")
        # Block cloud metadata IPs
        if ip.startswith("169.254."):
            raise ValueError(f"Blocked request to link-local metadata IP: {ip}")


async def import_chat_from_url(url: str, label: str | None = None) -> dict:
    """
    Fetch and ingest a conversation from a public AI chat URL.
    Supports ChatGPT shared links, Gemini shared links, Claude shared links,
    and any URL with conversation text.
    """
    platform = _detect_chat_platform(url)
    display_label = label or f"{platform.title()} Chat"

    _block_internal_ips(url)

    # Use httpx to fetch the page with a browser-like User-Agent
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, max_redirects=5) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            # Limit response body to prevent OOM from large pages
            content_bytes = await resp.aread()
            MAX_SIZE = 5 * 1024 * 1024  # 5 MB
            if len(content_bytes) > MAX_SIZE:
                return {"status": "error", "error": "Page content too large"}
            html = content_bytes.decode("utf-8", errors="replace")
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (401, 403):
            return {
                "status": "error",
                "error": (
                    f"This {platform} conversation requires you to be signed in. "
                    f"Please use the share feature in {platform.title()} to create a "
                    f"public link, then paste that shared link instead."
                ),
            }
        return {
            "status": "error",
            "error": f"Could not fetch URL: {e.response.status_code}",
        }
    except Exception as e:
        return {"status": "error", "error": f"Failed to fetch URL: {e}"}

    if not html or len(html) < 200:
        return {"status": "error", "error": "Page returned empty content"}

    content = ""

    # Try platform-specific extraction from __NEXT_DATA__ (SPA payloads)
    script_matches = re.findall(
        r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>',
        html, re.DOTALL
    )
    next_payload = None
    if script_matches:
        try:
            next_payload = json.loads(script_matches[0])
        except (json.JSONDecodeError, TypeError):
            pass

    if platform == "claude" and next_payload:
        conversation = (next_payload.get("props", {})
                        .get("pageProps", {})
                        .get("conversation", {}))
        if conversation:
            lines = []
            name = conversation.get("name", "").strip()
            if name:
                lines.append(f"Conversation: {name}")
            messages = conversation.get("messages", []) or conversation.get("chat_messages", [])
            for msg in messages:
                role = msg.get("role", "unknown").capitalize()
                text = msg.get("content", "") or msg.get("text", "")
                if isinstance(text, list):
                    text = " ".join(
                        p.get("text", "") for p in text if isinstance(p, dict) and p.get("type") == "text"
                    )
                if text:
                    lines.append(f"\n{role}: {text.strip()}")
            if lines:
                content = "\n".join(lines)

    if not content and platform == "chatgpt" and next_payload:
        conversation = (next_payload.get("props", {})
                        .get("pageProps", {})
                        .get("conversation", {}))
        if conversation:
            lines = []
            title = conversation.get("title", "").strip()
            if title:
                lines.append(f"Conversation: {title}")
            for item in conversation.get("items", []):
                role = item.get("role", "unknown").capitalize()
                text = item.get("content", "") or item.get("text", "")
                if text:
                    lines.append(f"\n{role}: {text.strip()}")
            if lines:
                content = "\n".join(lines)

    if not content and next_payload:
        # Generic NEXT_DATA crawl: walk for any large text fields
        try:
            props = next_payload.get("props", {}).get("pageProps", {})
            text = json.dumps(props, ensure_ascii=False)
            if len(text) > 200:
                content = text[:50_000]
        except (json.JSONDecodeError, TypeError):
            pass

    # Try trafilatura for clean text extraction
    if not content or len(content) < 100:
        extracted = trafilatura.extract(html, include_comments=False, include_tables=False)
        content = extracted.strip() if extracted else ""

    # Last fallback: just extract all visible text from HTML
    if not content or len(content) < 100:
        cleaned = re.sub(r'<[^>]+>', ' ', html)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        # Skip pages that are clearly just login/shell pages
        login_indicators = ["sign in", "log in", "sign up", "log in to continue"]
        if not any(ind in cleaned.lower()[:1000] for ind in login_indicators):
            content = cleaned[:50_000]

    if not content or len(content) < 100:
        return {
            "status": "error",
            "error": (
                "Could not extract conversation content from this URL. "
                "The page might require authentication. "
                f"Try sharing the conversation publicly from {platform.title()} and paste the shared link."
            ),
        }

    # Ingest the extracted content (fires background task, returns jobId)
    try:
        ingest_req = IngestRequest(
            type="conversation",
            content=content[:100_000],
            label=f"{display_label[:100]}",
        )
        result = await ingest_source(ingest_req)
        return {
            "status": "ok",
            "jobId": result.jobId,
            "imported": 1,
            "platform": platform,
            "content_preview": content[:200],
        }
    except Exception as e:
        return {"status": "error", "error": f"Failed to ingest conversation: {e}"}


async def reset_demo_data() -> None:
    uid = get_current_user()
    # Clear this user's rows, then seed a rich illustrative demo dataset.
    db_reseed(uid)
    db_seed_demo(uid)
    # Invalidate this user's cached views so the demo shows immediately.
    memory_cache.invalidate(_cache_key("graph_snapshot"))
    memory_cache.invalidate(_cache_key("sources"))
    memory_cache.invalidate(_cache_key("schema_inventory"))
    log_cognee_activity("seed", "Loaded demo dataset (sources, conflicts, timeline)")

def get_cognee_activities() -> list[dict]:
    uid = get_current_user() or "_system"
    return _cognee_activities_by_user.get(uid, [])


# ── Memory Recap: "Where's My Context?" ──
def _parse_iso(value: str):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


async def get_memory_recap(window_days: int = 7) -> MemoryRecap:
    """
    Assembles a 'morning after' recap of everything the memory learned, decided,
    reconciled, and forgot within the given window. Surfaces all four Cognee
    lifecycle operations in one narrative: remember (new sources), improve
    (decisions/reinforcement), recall (narrative synthesis), and forget (decay).
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=window_days)

    sources = db_get_sources()
    conflicts = db_get_conflicts(include_resolved=True)
    recon_log = db_get_reconciliation_log()
    confidence = db_get_confidence_history()

    def _in_window(iso: Optional[str]) -> bool:
        if not iso:
            return False
        dt = _parse_iso(iso)
        if not dt:
            return False
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt >= cutoff

    # Filter to the window first; if nothing recent, fall back to most-recent items
    # so the recap is never empty for demos / judges.
    windowed_sources = [s for s in sources if _in_window(s.ingestedAt)] or sources[:6]
    windowed_conflicts = [c for c in conflicts if _in_window(c.createdAt)] or conflicts[:6]
    windowed_recon = [e for e in recon_log if _in_window(e.createdAt)] or recon_log[:8]
    windowed_conf = [e for e in confidence if _in_window(e.date)] or confidence[-8:]

    events: list[RecapEvent] = []

    for s in windowed_sources[:8]:
        events.append(RecapEvent(
            kind="ingested",
            topic=s.label,
            detail=f"New {s.type} source folded into memory.",
            source=s.label,
            date=s.ingestedAt,
        ))

    for e in windowed_recon:
        if e.eventType in ("new_decision", "added"):
            events.append(RecapEvent(
                kind="decided",
                topic=e.topic,
                detail=e.newSummary or e.oldSummary or "A new decision was recorded.",
                source=e.source,
                date=e.createdAt,
            ))

    for c in windowed_conflicts:
        resolved = c.status != "pending"
        verb = "Resolved" if resolved else "Flagged"
        events.append(RecapEvent(
            kind="contradiction",
            topic=c.topic,
            detail=f"{verb}: \"{c.oldNodeSummary}\" vs \"{c.newNodeSummary}\".",
            source=c.newNodeSource,
            date=c.createdAt,
        ))

    for e in windowed_conf:
        if e.reason in ("decay_tick", "superseded") and e.confidenceScore < 0.25:
            events.append(RecapEvent(
                kind="forgotten",
                topic=e.topic,
                detail=f"\"{e.valueSummary}\" faded to {int(e.confidenceScore * 100)}% and was pruned.",
                date=e.date,
            ))
        elif e.reason == "reinforced":
            events.append(RecapEvent(
                kind="reinforced",
                topic=e.topic,
                detail=f"\"{e.valueSummary}\" reinforced to {int(e.confidenceScore * 100)}%.",
                date=e.date,
            ))

    # Sort newest first
    events.sort(key=lambda ev: ev.date or "", reverse=True)
    events = events[:24]

    stats = RecapStats(
        sourcesAdded=len(windowed_sources),
        decisionsMade=len([e for e in events if e.kind == "decided"]),
        contradictionsDetected=len(windowed_conflicts),
        contradictionsResolved=len([c for c in windowed_conflicts if c.status != "pending"]),
        factsForgotten=len([e for e in events if e.kind == "forgotten"]),
        factsReinforced=len([e for e in events if e.kind == "reinforced"]),
    )

    has_data = bool(sources or conflicts or recon_log or confidence)

    # Build the narrative. Prefer an LLM-written recap grounded in the real events.
    headline = "You're all caught up."
    narrative = ""

    if has_data:
        event_lines = "\n".join(
            f"- [{e.kind}] {e.topic}: {e.detail}" for e in events[:16]
        ) or "- (no notable changes)"
        sys_prompt = (
            "You are Engram, a self-organizing memory. Write a short, punchy 'morning after' "
            "recap addressed to the user in second person, themed loosely around waking up and "
            "recovering lost context (no heavy Vegas cliches). 2-3 sentences max. Be concrete: "
            "reference the actual topics and numbers. No preamble, no markdown headers."
        )
        user_prompt = (
            f"Time window: last {window_days} days.\n"
            f"Stats: {stats.sourcesAdded} sources added, {stats.decisionsMade} decisions, "
            f"{stats.contradictionsDetected} contradictions detected "
            f"({stats.contradictionsResolved} resolved), {stats.factsForgotten} facts forgotten, "
            f"{stats.factsReinforced} reinforced.\n\n"
            f"Notable events:\n{event_lines}\n\n"
            "Write the recap now."
        )
        try:
            if HAS_LLM or db_get_user_ai_config():
                text = await call_llm(user_prompt, system_prompt=sys_prompt)
                if text and text.strip():
                    narrative = text.strip()
                    log_cognee_activity("recall()", "Synthesized memory recap narrative")
        except Exception as e:
            print(f"[Recap] LLM narrative failed: {e}", flush=True)

    if not narrative:
        # Deterministic fallback narrative
        if not has_data:
            headline = "Nothing to recall yet."
            narrative = (
                "Your memory is a blank slate. Ingest a source and Engram will start "
                "tracking what you learn, decide, and change your mind about."
            )
        else:
            parts = []
            if stats.sourcesAdded:
                parts.append(f"folded in {stats.sourcesAdded} source" + ("s" if stats.sourcesAdded != 1 else ""))
            if stats.decisionsMade:
                parts.append(f"logged {stats.decisionsMade} decision" + ("s" if stats.decisionsMade != 1 else ""))
            if stats.contradictionsDetected:
                parts.append(f"caught {stats.contradictionsDetected} contradiction" + ("s" if stats.contradictionsDetected != 1 else ""))
            if stats.factsForgotten:
                parts.append(f"pruned {stats.factsForgotten} stale fact" + ("s" if stats.factsForgotten != 1 else ""))
            joined = ", ".join(parts) if parts else "kept your memory steady"
            headline = "Here's what happened while you were out."
            narrative = f"Since you last checked in, Engram {joined}. Everything below is reconciled and ready to recall."
    else:
        headline = "Here's what happened while you were out."

    return MemoryRecap(
        generatedAt=now.isoformat(),
        windowDays=window_days,
        headline=headline,
        narrative=narrative,
        stats=stats,
        events=events,
        hasData=has_data,
    )


# ── Optional: route Cognee operations to a hosted Cognee Cloud instance ──
COGNEE_CLOUD_CONNECTED = False


async def connect_cognee_cloud() -> bool:
    """
    Verify a connection to a hosted Cognee Cloud tenant via its REST API.
    Activates only when COGNEE_API_KEY and COGNEE_SERVICE_URL are both set.
    On success, ingest/recall/forget will prefer the cloud tenant (with local
    fallback). Any failure logs and leaves the app on local memory.
    """
    global COGNEE_CLOUD_CONNECTED
    from cognee_cloud import get_cloud_client, cloud_enabled

    if not cloud_enabled():
        missing = [
            name for name in ("COGNEE_API_KEY", "COGNEE_SERVICE_URL")
            if not os.environ.get(name)
        ]
        print(
            "[Cognee] Cloud routing DISABLED — using the local embedded SDK "
            f"(graph is empty on a fresh container). Missing env vars: {', '.join(missing)}. "
            "Set them in your host's environment to route remember/recall/improve/forget "
            "to the hosted tenant.",
            flush=True,
        )
        return False

    client = get_cloud_client()
    if client is None:
        return False

    # Retry the health check a few times so a transient DNS blip at startup
    # does not disable the tenant for the whole session.
    last_err: Optional[Exception] = None
    for attempt in range(3):
        try:
            await client.health()
            COGNEE_CLOUD_CONNECTED = True
            log_cognee_activity("serve()", "Connected to Cognee Cloud — remember/recall/forget route to the hosted tenant")
            print(f"[Cognee] Connected to Cognee Cloud tenant at {os.environ.get('COGNEE_SERVICE_URL')}.", flush=True)
            return True
        except Exception as e:
            last_err = e
            if attempt < 2:
                await asyncio.sleep(1.5)
    print(f"[Cognee] Cloud health check failed ({last_err}); credentials are set, so recall/ingest will still try the tenant per-request with local fallback.", flush=True)
    return False


def cognee_cloud_active() -> bool:
    # Cognee-first: route to the hosted tenant whenever credentials are configured.
    # Every cloud call is wrapped in try/except with a local fallback, so a flaky
    # startup health check never permanently forces answers onto the fallback LLM.
    from cognee_cloud import cloud_enabled
    return cloud_enabled()


def cognee_status() -> dict:
    """Diagnostic snapshot of how memory is routed. Safe to expose (no secrets):
    lets you confirm at a glance whether the hosted Cognee Cloud tenant is active
    in production, or whether the app has silently fallen back to the local SDK."""
    cloud = cognee_cloud_active()
    missing = [
        name for name in ("COGNEE_API_KEY", "COGNEE_SERVICE_URL")
        if not os.environ.get(name)
    ]
    return {
        "cloud_enabled": cloud,
        "cloud_connected": COGNEE_CLOUD_CONNECTED,
        "local_sdk_ready": COGNEE_READY,
        "missing_cloud_env": missing,
        "recall_source": "cognee-cloud" if cloud else ("local-sdk" if COGNEE_READY else "llm-fallback"),
    }


async def get_cognee_graph_status() -> dict:
    """Report whether the knowledge graph has finished building for the current
    user's dataset. Cloud ingest runs cognify in the background, so right after
    an ingest the graph can still be empty for a short window. The UI polls this
    to show a 'building' state instead of looking permanently empty."""
    dataset = get_cognee_dataset()
    backend = "cloud" if cognee_cloud_active() else ("local" if COGNEE_READY else "none")
    node_count = 0
    try:
        snap = await get_graph_snapshot()
        node_count = len(snap.nodes)
    except Exception as e:
        print(f"[Cognee] graph status failed ({e})", flush=True)
    has_sources = bool(db_get_sources())
    return {
        "backend": backend,
        "dataset": dataset,
        "nodeCount": node_count,
        "ready": node_count > 0,
        "building": node_count == 0 and has_sources,
    }


async def get_review_candidates(limit: int = 10) -> list[dict]:
    """Surface the facts most in need of review, lowest confidence first.

    Confidence doubles as a mastery/freshness signal: low-confidence and
    decaying nodes are the ones a learner should revisit or a workflow should
    re-confirm. This is read-only and reuses the cached graph snapshot, so it
    adds no new load-bearing logic."""
    snap = await get_graph_snapshot()
    ranked = sorted(snap.nodes, key=lambda n: (n.status != "decaying", n.confidenceScore))
    out: list[dict] = []
    for n in ranked[: max(1, min(limit, 50))]:
        out.append({
            "label": n.label,
            "summary": n.summary,
            "confidence": round(n.confidenceScore, 3),
            "status": n.status,
            "sourceProvenance": n.sourceProvenance,
        })
    return out
