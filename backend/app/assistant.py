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
from .models import AssistantCall, Night, Person, Presence, Stay
from .slots import MEALS, WEEKDAYS, short_day, stay_nights, stay_slots

MODEL = "claude-sonnet-5-5"
MAX_TOOL_ROUNDS = 4
RATE_LIMIT = 30  # demandes par séjour, dans une fenêtre glissante de 24 h
RATE_WINDOW = timedelta(hours=24)

PENDING_TEXT = "Proposition prête, en attente de validation par l'utilisateur : rien n'est encore enregistré."
REFUSAL_TEXT = "Désolé, je ne peux pas traiter cette demande. Je m'occupe uniquement des présences (repas et nuits)."

MEAL_LABELS = {"breakfast": "petit-déjeuner", "lunch": "déjeuner", "dinner": "dîner"}

PROPOSE_TOOL = {
    "name": "propose_household_presences",
    "description": (
        "Proposer les présences du foyer : pour chaque membre concerné, sa person_id, la liste complète "
        "des repas (date au format AAAA-MM-JJ et repas) où il sera présent et, s'il en est question, la "
        "liste complète des nuits où il dort sur place."
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
                        "nights": {
                            "type": "array",
                            "description": (
                                "Nuits passées sur place, chacune désignée par la date du soir (AAAA-MM-JJ). "
                                "Absent : les nuits suivent les repas (dîner et petit-déjeuner du lendemain)."
                            ),
                            "items": {"type": "string"},
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


def night_label(night: date) -> str:
    return f"nuit du {short_day(night)} ({night.isoformat()})"


def build_system_prompt(
    stay: Stay, me: Person, members: list[Person], presences: list[Presence], nights: list[Night], today: date
) -> str:
    slots = [s.SlotIn(date=d, meal=m) for d, m in stay_slots(stay.start_date, stay.end_date, stay.first_meal, stay.last_meal)]
    presence_of: dict[int, list[s.SlotIn]] = {}
    for pr in presences:
        presence_of.setdefault(pr.person_id, []).append(s.SlotIn(date=pr.date, meal=pr.meal))
    nights_of: dict[int, list[date]] = {}
    for n in nights:
        nights_of.setdefault(n.person_id, []).append(n.date)
    by_date = lambda x: (x.date, MEALS.index(x.meal))
    lines = [
        f"Tu es l'assistant de présences du séjour « {stay.name} », du {stay.start_date.strftime('%d/%m/%Y')} "
        f"au {stay.end_date.strftime('%d/%m/%Y')}.",
        f"Aujourd'hui, nous sommes le {WEEKDAYS[today.weekday()]} {today.strftime('%d/%m/%Y')}.",
        "",
        "Créneaux possibles (présence à un repas) :",
        *[f"- {slot_label(slot)}" for slot in slots],
        "",
        "Nuits possibles (la nuit du jour J va de J à J+1) :",
        *[f"- {night_label(night)}" for night in stay_nights(stay.start_date, stay.end_date)],
        "",
        f"Tu parles avec {me.name}. Membres de son foyer (person_id, nom) et présences actuelles :",
        *[
            f"- person_id {m.id} : {m.name}{' (enfant)' if m.kind == 'child' else ''} — repas : "
            f"{', '.join(slot_label(s) for s in sorted(presence_of.get(m.id, []), key=by_date)) or 'aucun'} ; nuits : "
            f"{', '.join(night_label(d) for d in sorted(nights_of.get(m.id, []))) or 'aucune'}"
            for m in members
        ],
        "",
        "Consignes : réponds toujours en français. Pour renseigner ou modifier les présences du foyer, "
        "appelle l'outil propose_household_presences avec, pour chaque membre concerné, sa person_id "
        "(ci-dessus) et la liste complète des repas où il sera présent, choisie uniquement dans les "
        "créneaux ci-dessus (une personne absente d'un repas : on l'omet). Les nuits passées sur place se "
        "notent à part, dans nights, avec la liste complète : quelqu'un qui arrive après le dîner dort quand "
        "même sur place, quelqu'un qui dîne puis rentre dormir chez lui n'y dort pas. Si l'utilisateur ne "
        "parle pas de nuits, omets nights : elles suivront les repas. « Toute la famille », « on », "
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
    return [_action(db, stay, m) for m in members], None


def _action(db: Session, stay: Stay, m: h.Member) -> s.AssistantAction:
    return s.AssistantAction(
        person_id=m.person.id,
        name=m.person.name,
        slots=m.slots,
        nights=sorted(h.resolved_nights(db, stay, m)),
        nights_explicit=m.nights is not None,
    )


def _fallback_text(actions: list[s.AssistantAction]) -> str:
    if not actions:
        return "Désolé, je n'ai pas pu formuler de proposition valide. Peux-tu reformuler ta demande ?"
    lines = [
        f"- {a.name} : {', '.join(slot_label(s) for s in a.slots) or 'aucun repas'} ; "
        f"nuits : {', '.join(short_day(d) for d in a.nights) or 'aucune'}"
        for a in actions
    ]
    return "\n".join(["Voici mes propositions :", *lines])


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
    # Nuits non précisées : déduites des repas, comme pour Claude (rien n'est effacé à la validation).
    actions = [_action(db, stay, h.Member(m, [slot])) for m in members]
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
    ids = [m.id for m in members]
    presences = list(db.scalars(select(Presence).where(Presence.person_id.in_(ids))))
    nights = list(db.scalars(select(Night).where(Night.person_id.in_(ids))))
    system = build_system_prompt(stay, me, members, presences, nights, date.today())
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
