"""Images envoyées : type reconnu au contenu, jamais à l'en-tête du client."""

MAX_COVER_BYTES = 5_000_000


def image_type(data: bytes) -> str | None:
    """JPEG, PNG ou WebP d'après les premiers octets ; None pour tout le reste."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None
