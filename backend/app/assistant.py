"""Assistant IA « formulaires conversationnels » : les présences d'un foyer se renseignent en langue naturelle.

Un seul outil, propose_household_presences, dont chaque proposition est vérifiée par les règles du
foyer (household_members) avant d'être proposée au front ; une proposition refusée est renvoyée à
Claude avec le message d'erreur en français pour qu'il se corrige.
"""

import os
from datetime import date, datetime, timedelta, timezone

from anthropic import Anthropic
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import households as h
from . import schemas as s
from .deps import person
from .models import AssistantCall, Person, Presence, Stay
from .slots import MEALS, stay_slots

MODEL = "claude-sonnet-5-5"
MAX_TOOL_ROUNDS = 4
RATE_LIMIT = 30  # demandes par séjour, dans une fenêtre glissante de 24 h
RATE_WINDOW = timedelta(hours=24)

PENDING_TEXT = "Proposition prête, en attente de validation par l'utilisateur : rien n'est encore enregistré."
REFUSAL_TEXT = "Désolé, je ne peux pas traiter cette demande. Je m'occupe uniquement des présences aux repas."

MEAL_LABELS = {"breakfast": "petit-déjeuner", "lunch": "déjeuner", "dinner": "dîner"}
WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]

PROPOSE_TOOL = {
    "name": "propose_household_presences",
    "description": (
        "Proposer les présences du foyer aux repas : pour chaque membre concerné, sa person_id et "
        "la liste complète des créneaux (date au format AAAA-MM-JJ et repas) où il sera présent."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "members": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "person_id": {"type": "integer"},
                        "slots": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "date": {"type": "string", "description": "Au format AAAA-MM-JJ"},
                                    "meal": {"type": "string", "enum": MEALS},
                                },
                                "required": ["date", "meal"],
                            },
                        },
                    },
                    "required": ["person_id", "slots"],
                },
            }
        },
        "required": ["members"],
    },
}


def enabled() -> bool:
    return os.environ.get("ASSISTANT_STUB") == "true" or bool(os.environ.get("ANTHROPIC_API_KEY"))


def check_rate_limit(db: Session, stay_id: int) -> None:
    since = datetime.now(timezone.utc) - RATE_WINDOW
    calls = db.scalar(
        select(func.count(AssistantCall.id)).where(AssistantCall.stay_id == stay_id, AssistantCall.created_at >= since)
    )
    if calls >= RATE_LIMIT:
        raise HTTPException(429, f"Trop de demandes pour ce séjour : {RATE_LIMIT} par jour au maximum.")


def slot_label(slot) -> str:
    d = slot.date
    return f"{WEEKDAYS[d.weekday()][:3]} {d.strftime('%d/%m')} {MEAL_LABELS[slot.meal]}"


def build_system_prompt(stay: Stay, me: Person, members: list[Person], presences: list[Presence], today: date) -> str:
    slots = [s.SlotIn(date=d, meal=m) for d, m in stay_slots(stay.start_date, stay.end_date, stay.first_meal, stay.last_meal)]
    presence_of: dict[int, list[s.SlotIn]] = {}
    for pr in presences:
        presence_of.setdefault(pr.person_id, []).append(s.SlotIn(date=pr.date, meal=pr.meal))
    by_date = lambda x: (x.date, MEALS.index(x.meal))
    lines = [
        f"Tu es l'assistant de présences du séjour « {stay.name} », du {stay.start_date.strftime('%d/%m/%Y')} "
        f"au {stay.end_date.strftime('%d/%m/%Y')}.",
        f"Aujourd'hui, nous sommes le {WEEKDAYS[today.weekday()]} {today.strftime('%d/%m/%Y')}.",
        "",
        "Créneaux possibles (présence à un repas) :",
        *[f"- {slot_label(slot)}" for slot in slots],
        "",
        f"Tu parles avec {me.name}. Membres de son foyer (person_id, nom) et présences actuelles :",
        *[
            f"- person_id {m.id} : {m.name}{' (enfant)' if m.kind == 'child' else ''} — "
            f"{', '.join(slot_label(s) for s in sorted(presence_of.get(m.id, []), key=by_date)) or 'aucune présence'}"
            for m in members
        ],
        "",
        "Consignes : réponds toujours en français. Pour renseigner ou modifier les présences du foyer, "
        "appelle l'outil propose_household_presences avec, pour chaque membre concerné, sa person_id "
        "(ci-dessus) et la liste complète des repas où il sera présent, choisie uniquement dans les "
        "créneaux ci-dessus (une personne absente d'un repas : on l'omet). « Toute la famille », « on », "
        "« nous » désignent tout le foyer. L'utilisateur valide ensuite chaque proposition, qui s'affiche "
        "en détail sous ta réponse : termine donc par une ou deux phrases de résumé, en texte brut sans "
        "markdown ni liste. Si la demande ne concerne pas les présences, réponds simplement sans appeler d'outil.",
    ]
    return "\n".join(lines)


def _to_messages(history: list[str], message: str) -> list[dict]:
    turns = [*history, message]
    return [{"role": "user" if i % 2 == 0 else "assistant", "content": turn} for i, turn in enumerate(turns)]


def _complete(client, system: str, messages: list[dict]):
    return client.messages.create(
        model=MODEL,
        max_tokens=16000,
        system=system,
        messages=messages,
        tools=[PROPOSE_TOOL],
        output_config={"effort": "low"},
    )


def _validate_and_feedback(
    db: Session, stay: Stay, household_id: int, tu
) -> tuple[list[s.AssistantAction], str | None]:
    if tu.name != PROPOSE_TOOL["name"]:
        return [], f"Outil inconnu « {tu.name} » : n'utilise que l'outil propose_household_presences."
    try:
        body = s.HouseholdPresencesIn.model_validate(tu.input)
    except ValidationError as exc:
        details = "; ".join(
            f"{'.'.join(str(p) for p in e.get('loc', ())) or 'proposition'} : {e.get('msg', '')}" for e in exc.errors()
        )
        return [], f"Proposition incomplète. {details}"
    try:
        members = h.household_members(db, stay, household_id, body)
    except HTTPException as exc:
        return [], str(exc.detail)
    return [s.AssistantAction(person_id=p.id, name=p.name, slots=slots) for p, slots in members], None


def _fallback_text(actions: list[s.AssistantAction]) -> str:
    if not actions:
        return "Désolé, je n'ai pas pu formuler de proposition valide. Peux-tu reformuler ta demande ?"
    return "\n".join(["Voici mes propositions :", *[f"- {a.name} : {', '.join(slot_label(s) for s in a.slots)}" for a in actions]])


def _stub_reply(db: Session, stay: Stay, req: s.AssistantIn) -> s.AssistantOut:
    """Réponse déterministe (mode démo ASSISTANT_STUB=true) : tout le foyer au premier repas du séjour."""
    me = person(db, req.person_id, stay)
    members = list(
        db.scalars(
            select(Person).where(Person.stay_id == stay.id, Person.household_id == me.household_id).order_by(Person.kind, Person.id)
        )
    )
    d, meal = stay_slots(stay.start_date, stay.end_date, stay.first_meal, stay.last_meal)[0]
    slot = s.SlotIn(date=d, meal=meal)
    actions = [s.AssistantAction(person_id=m.id, name=m.name, slots=[slot]) for m in members]
    text = f"Voici ma proposition : je suggère que {', '.join(m.name for m in members)} se retrouvent au premier repas du séjour."
    return s.AssistantOut(text=text, actions=actions)


def assistant_reply(db: Session, stay: Stay, req: s.AssistantIn, client=None) -> s.AssistantOut:
    if os.environ.get("ASSISTANT_STUB") == "true":
        return _stub_reply(db, stay, req)
    if client is None:
        client = Anthropic()
    me = person(db, req.person_id, stay)
    members = list(
        db.scalars(
            select(Person).where(Person.stay_id == stay.id, Person.household_id == me.household_id).order_by(Person.kind, Person.id)
        )
    )
    presences = list(db.scalars(select(Presence).where(Presence.person_id.in_([m.id for m in members]))))
    system = build_system_prompt(stay, me, members, presences, date.today())
    messages = _to_messages(req.history, req.message)
    # Une personne proposée plusieurs fois (correction de Claude) : la dernière proposition l'emporte.
    actions: dict[int, s.AssistantAction] = {}
    text = ""
    for _ in range(MAX_TOOL_ROUNDS):
        response = _complete(client, system, messages)
        if response.stop_reason == "refusal":
            return s.AssistantOut(text=REFUSAL_TEXT, actions=[])
        pieces = [b.text for b in response.content if b.type == "text"]
        if pieces:
            text = "".join(pieces)
        tool_uses = [b for b in response.content if b.type == "tool_use"]
        # Contenu renvoyé tel quel : les blocs de réflexion doivent revenir intacts au modèle.
        messages.append({"role": "assistant", "content": response.content})
        if not tool_uses:
            break
        results = []
        for tu in tool_uses:
            proposed, error = _validate_and_feedback(db, stay, me.household_id, tu)
            results.append({"type": "tool_result", "tool_use_id": tu.id, "content": error or PENDING_TEXT, "is_error": bool(error)})
            actions.update((a.person_id, a) for a in proposed)
        # Tous les résultats dans un seul message, comme l'attend l'API.
        messages.append({"role": "user", "content": results})
    else:
        text = text or _fallback_text(list(actions.values()))
    return s.AssistantOut(text=text, actions=list(actions.values()))
