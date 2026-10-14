"""Images envoyées : type reconnu au contenu, jamais à l'en-tête du client."""

import io

from PIL import Image, ImageOps

MAX_COVER_BYTES = 5_000_000
# Au-delà, décoder coûterait trop de mémoire (bombe de décompression) ; le front envoie du 1600 px.
MAX_COVER_PIXELS = 4096 * 4096
# Vignette carrée de l'accueil (56 px affichés, écrans haute densité compris).
THUMB_SIDE = 192


def image_type(data: bytes) -> str | None:
    """JPEG, PNG ou WebP d'après les premiers octets ; None pour tout le reste."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def thumbnail(data: bytes) -> bytes | None:
    """Vignette WebP recadrée au centre (transparence gardée) ; None si l'image est illisible ou démesurée."""
    try:
        with Image.open(io.BytesIO(data)) as im:
            if im.width * im.height > MAX_COVER_PIXELS:
                return None
            im.draft("RGB", (THUMB_SIDE, THUMB_SIDE))  # JPEG : décodé directement en petit
            mode = "RGBA" if im.has_transparency_data else "RGB"
            small = ImageOps.fit(ImageOps.exif_transpose(im).convert(mode), (THUMB_SIDE, THUMB_SIDE))
        out = io.BytesIO()
        small.save(out, "WEBP", quality=80)
        return out.getvalue()
    except Exception:  # fichier tronqué ou corrompu : Pillow lève des erreurs de types variés
        return None
