import contextvars

_current_user: contextvars.ContextVar[str] = contextvars.ContextVar("current_user_id", default="")

def set_current_user(user_id: str) -> None:
    _current_user.set(user_id)

def get_current_user() -> str:
    return _current_user.get()

def _cache_key(key: str) -> str:
    uid = get_current_user() or "anonymous"
    return f"{uid}:{key}"
