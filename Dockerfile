# syntax=docker/dockerfile:1.7

# --- Étape 1 : build du front Vite ---
FROM node:22-alpine AS front
WORKDIR /front
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Étape 2 : runtime FastAPI, qui sert l'API et le front ---
FROM python:3.13-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/app/.venv
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/app ./app
COPY --from=front /front/dist ./static

ENV PATH="/app/.venv/bin:$PATH" \
    STATIC_DIR=/app/static \
    # la base SQLite vit sur le volume persistant monté par once
    DATABASE_URL=sqlite:////storage/family_planner.db

VOLUME ["/storage"]
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1/up', timeout=3)" || exit 1

# derrière le proxy once : faire confiance aux en-têtes X-Forwarded-*
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "80", "--proxy-headers", "--forwarded-allow-ips", "*"]
