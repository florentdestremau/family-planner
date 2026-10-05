import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from .db import engine
from .models import Base
from .routers import admin, public

Base.metadata.create_all(engine)

if os.environ.get("FIXTURES") == "true":
    from .fixtures import load_all

    load_all()

app = FastAPI(title="Family Planner")
app.include_router(public.router)
app.include_router(admin.router)


@app.get("/up", include_in_schema=False, response_class=PlainTextResponse)
def up() -> str:
    """Sonde de santé (HEALTHCHECK de l'image, proxy once)."""
    return "OK"

# Le front (build Vite) est servi par le même conteneur.
STATIC_DIR = Path(os.environ.get("STATIC_DIR", Path(__file__).parent.parent / "static"))

if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(404)
        candidate = (STATIC_DIR / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(STATIC_DIR.resolve()):
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
