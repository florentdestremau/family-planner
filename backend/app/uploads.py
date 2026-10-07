"""Gestion des fichiers uploadés (image de couverture du séjour)."""

import os
import re
import secrets
from pathlib import Path

from fastapi import HTTPException, UploadFile

# En prod : /storage/uploads (volume persistant) ; en local : ./uploads à côté de la base.
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", Path(__file__).parent.parent / "uploads"))

MAX_SIZE = 5 * 1024 * 1024  # 5 Mo
ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


def cover_dir(slug: str) -> Path:
    return UPLOAD_DIR / slug


def cover_path(slug: str, filename: str) -> Path:
    return cover_dir(slug) / filename


def _safe_filename(filename: str) -> str:
    """Garde uniquement le nom de base, sans chemin relatif."""
    name = Path(filename).name
    if not re.fullmatch(r"[A-Za-z0-9._-]+", name):
        raise HTTPException(422, "Nom de fichier invalide")
    return name


async def save_cover(slug: str, file: UploadFile) -> str:
    """Enregistre l'image de couverture et retourne le nom du fichier stocké."""
    content_type = file.content_type or ""
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(422, "Format non accepté (JPEG, PNG, GIF ou WebP uniquement)")

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(422, "Image trop lourde (5 Mo maximum)")
    if not data:
        raise HTTPException(422, "Fichier vide")

    ext = ALLOWED_TYPES[content_type]
    filename = f"cover-{secrets.token_hex(4)}{ext}"

    directory = cover_dir(slug)
    directory.mkdir(parents=True, exist_ok=True)

    # Supprime l'ancienne image de couverture si elle existe.
    for old in directory.glob("cover-*"):
        old.unlink(missing_ok=True)

    (directory / filename).write_bytes(data)
    return filename


def delete_cover(slug: str, filename: str | None) -> None:
    """Supprime le fichier image s'il existe."""
    if not filename:
        return
    path = cover_path(slug, _safe_filename(filename))
    path.unlink(missing_ok=True)
