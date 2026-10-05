import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from .db import engine
from .models import Base
from .routers import admin, public

# Le front (build Vite) est servi par le même conteneur.
STATIC_DIR = Path(os.environ.get("STATIC_DIR", Path(__file__).parent.parent / "static"))


def bootstrap() -> None:
    """Crée les tables et, si FIXTURES=true, charge les séjours de démonstration."""
    Base.metadata.create_all(engine)
    if os.environ.get("FIXTURES") == "true":
        from .fixtures import load_all

        load_all()


def create_app(static_dir: Path = STATIC_DIR) -> FastAPI:
    app = FastAPI(title="Family Planner")
    app.include_router(public.router)
    app.include_router(admin.router)

    @app.get("/up", include_in_schema=False, response_class=PlainTextResponse)
    def up() -> str:
        """Sonde de santé (HEALTHCHECK de l'image, proxy once)."""
        return "OK"

    if static_dir.is_dir():
        root = static_dir.resolve()
        if (root / "assets").is_dir():
            app.mount("/assets", StaticFiles(directory=root / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str) -> FileResponse:
            if path == "api" or path.startswith("api/"):
                raise HTTPException(404)
            candidate = (root / path).resolve()
            if path and candidate.is_file() and candidate.is_relative_to(root):
                return FileResponse(candidate)
            return FileResponse(root / "index.html")

    return app


bootstrap()
app = create_app()
