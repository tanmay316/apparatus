from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

_url = settings.get_database_uri()
_is_sqlite = _url.startswith("sqlite")

# Supabase's pooler drops idle connections, which otherwise surface later as
# "server closed the connection unexpectedly"; pre-ping revalidates on checkout.
_engine_kwargs = {"pool_pre_ping": True}
if not _is_sqlite:
    _engine_kwargs["pool_recycle"] = 300

engine = create_engine(_url, **_engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
