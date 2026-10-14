"""Lieu du séjour : le lien de carte collé par l'organisateur doit être un lien Google Maps."""

import re
from urllib.parse import urlsplit

# google.com, google.fr, google.co.uk, google.com.br… et maps.google.<même chose> : .com ou un domaine
# de pays seulement (pas google.fun, google.icu…, qui n'appartiennent pas forcément à Google).
GOOGLE = re.compile(r"^(www\.|maps\.)?google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$")


def is_google_maps_url(url: str) -> bool:
    """Lien https vers Google Maps : partage court (maps.app.goo.gl, goo.gl/maps) ou google.<pays>/maps."""
    parts = urlsplit(url)
    host = parts.hostname or ""  # sans identifiants ni port : « google.com@ailleurs.fr » vise ailleurs.fr
    if parts.scheme != "https" or parts.username is not None:
        return False
    if host == "maps.app.goo.gl":
        return True
    in_maps = parts.path == "/maps" or parts.path.startswith("/maps/")
    if host == "goo.gl":
        return in_maps
    match = GOOGLE.match(host)
    return bool(match) and (match.group(1) == "maps." or in_maps)
