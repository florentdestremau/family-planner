import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { actorHeaders, api, ApiError, assistantAsk, assistantStatus, type AssistantAction } from "../api";
import { actionSummary } from "../lib";
import { useOnline } from "./Pwa";
import { useStay } from "../stay";
import { toast } from "../toast";

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  actions: AssistantAction[];
}

interface MicRec {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  addEventListener: ((type: "result", listener: (e: { results: Array<Array<{ transcript: string }>> }) => void) => void) &
    ((type: "end" | "error", listener: () => void) => void);
  start: () => void;
  stop: () => void;
}
type MicCtor = new () => MicRec;

declare global {
  interface Window {
    SpeechRecognition?: MicCtor;
    webkitSpeechRecognition?: MicCtor;
  }
}

/** Panneau de discussion avec l'assistant : bouton flottant ✨, micro, propositions à valider. */
export default function AssistantFab() {
  const { slug, me } = useStay();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const recRef = useRef<MicRec | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const isOnline = useOnline();

  // Hors ligne au chargement : on redemande au retour du réseau.
  useEffect(() => {
    if (!isOnline || enabled !== null) return;
    assistantStatus()
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, [isOnline, enabled]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, open]);

  useEffect(() => () => recRef.current?.stop(), []);

  // À l'ouverture, curseur dans la zone de texte (pas sur mobile : le clavier masquerait le panneau).
  useEffect(() => {
    if (open && window.matchMedia?.("(pointer: fine)").matches) inputRef.current?.focus();
  }, [open]);

  if (!me || enabled !== true || !isOnline) return null;

  const Mic = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  const micSupported = Mic !== undefined;

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || busy) return;
    const history = messages.map((m) => m.text);
    setMessages((ms) => [...ms, { role: "user", text: clean, actions: [] }]);
    setInput("");
    setBusy(true);
    try {
      const out = await assistantAsk(slug, me.id, clean, history);
      setMessages((ms) => [...ms, { role: "assistant", text: out.text, actions: out.actions }]);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Impossible de joindre l'assistant.";
      setMessages((ms) => [...ms, { role: "assistant", text: `😔 ${message}`, actions: [] }]);
    } finally {
      setBusy(false);
    }
  };

  /** Enlève la carte d'une personne (validée ou ignorée) du dernier message. */
  // Seules les cartes du dernier message restent actives, et rien pendant une réponse en cours.
  const disabled = (i: number) => i !== messages.length - 1 || busy;

  /** Enlève des cartes (validées ou ignorées) d'un message, ou les y remet si l'enregistrement échoue. */
  const setActions = (i: number, update: (actions: AssistantAction[]) => AssistantAction[]) =>
    setMessages((ms) => ms.map((m, idx) => (idx === i ? { ...m, actions: update(m.actions) } : m)));
  const settle = (i: number, personIds: number[]) => setActions(i, (as) => as.filter((a) => !personIds.includes(a.person_id)));

  /** Un seul envoi pour toutes les cartes validées ensemble : tout est enregistré, ou rien. */
  const validate = async (i: number, actions: AssistantAction[]) => {
    settle(i, actions.map((a) => a.person_id));
    try {
      const members = actions.map((a) => ({ person_id: a.person_id, slots: a.slots, nights: a.nights_explicit ? a.nights : undefined }));
      await api("PUT", `/stays/${slug}/households/${me.household_id}/presences`, { members }, null, actorHeaders(me.id, "assistant"));
      const names = actions.map((a) => a.name);
      toast(names.length === 1 ? `Présences de ${names[0]} enregistrées` : `Présences enregistrées pour ${names.join(", ")}`);
      await Promise.all([qc.invalidateQueries({ queryKey: ["stay", slug] }), qc.invalidateQueries({ queryKey: ["journal", slug] })]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Impossible d'enregistrer les présences.", "error");
      setActions(i, (as) => [...as, ...actions]);
    }
  };

  const toggleMic = () => {
    if (recording) {
      recRef.current?.stop();
      setRecording(false);
      return;
    }
    if (!Mic) return;
    const rec = new Mic();
    rec.lang = "fr-FR";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.addEventListener("result", (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) setInput((t) => (t ? `${t} ${transcript}` : transcript));
    });
    rec.addEventListener("end", () => setRecording(false));
    rec.addEventListener("error", () => {
      setRecording(false);
      toast("Le micro n'a pas pu démarrer.", "error");
    });
    recRef.current = rec;
    try {
      rec.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="assistant-fab no-print"
        aria-label={open ? "Fermer l'assistant" : "Ouvrir l'assistant"}
        onClick={() => setOpen((o) => !o)}
      >
        ✨
      </button>
      {open && (
        <section className="assistant-panel no-print" aria-label="Assistant de présences">
          <header className="assistant-head">
            <strong>Assistant</strong>
            <span className="hint">présences du foyer</span>
            <span className="spacer" />
            <button type="button" className="btn-icon" aria-label="Fermer le panneau" onClick={() => setOpen(false)}>
              ✕
            </button>
          </header>
          <div className="assistant-messages" ref={listRef}>
            {messages.length === 0 && (
              <p className="hint">
                Décris ce que tu veux : « toute l'équipe au dîner du vendredi », « on arrive vendredi après le dîner », « Léo dort chez un copain samedi »…
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`assistant-msg${m.role === "user" ? " assistant-me" : ""}`}>
                {m.role !== "user" && <span className="assistant-name">✨ Assistant</span>}
                <div className="assistant-bubble">{m.text}</div>
                {m.role === "assistant" && m.actions.length > 0 && (
                  <div className="assistant-cards">
                    {m.actions.map((a) => (
                      <div key={a.person_id} className="assistant-card">
                        <span>{actionSummary(a)}</span>
                        <div className="actions">
                          <button
                            type="button"
                            className="btn btn-small btn-primary"
                            disabled={disabled(i)}
                            aria-label={`Valider ${a.name}`}
                            onClick={() => void validate(i, [a])}
                          >
                            Valider
                          </button>
                          <button
                            type="button"
                            className="btn btn-small"
                            disabled={disabled(i)}
                            aria-label={`Ignorer ${a.name}`}
                            onClick={() => settle(i, [a.person_id])}
                          >
                            Ignorer
                          </button>
                        </div>
                      </div>
                    ))}
                    {m.actions.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-small btn-primary assistant-all"
                        disabled={disabled(i)}
                        onClick={() => void validate(i, m.actions)}
                      >
                        Tout valider ({m.actions.length})
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {busy && <p className="hint assistant-thinking">✨ L'assistant réfléchit…</p>}
          </div>
          <form
            className="assistant-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Entrée envoie, Maj+Entrée va à la ligne.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Écris ou dicte ta demande…"
              aria-label="Message à l'assistant"
            />
            <div className="assistant-compose-actions">
              {micSupported && (
                <button
                  type="button"
                  className={`btn btn-small assistant-mic${recording ? " on" : ""}`}
                  onClick={toggleMic}
                  aria-label={recording ? "Arrêter le micro" : "Dicter au micro"}
                >
                  {recording ? "⏹️ Arrêter" : "🎙️ Dicter"}
                </button>
              )}
              <span className="spacer" />
              <button type="submit" className="btn btn-small btn-primary" disabled={busy || !input.trim()}>
                Envoyer
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}