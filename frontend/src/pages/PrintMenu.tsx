import { Link } from "react-router";
import { CopyButton } from "../components/ui";
import { llmExport } from "../lib";
import { useStay } from "../stay";

const PRINTS = [
  { kind: "presences", title: "Planning de présence", text: "Qui est là à chaque repas et chaque nuit, avec les couverts et les couchages." },
  { kind: "corvees", title: "Corvées par personne", text: "Une fiche par personne, plus le tableau jour par jour." },
  { kind: "menus", title: "Menus pour l'équipe cuisine", text: "Chaque repas avec ses plats, ses couverts, régimes et allergies." },
  { kind: "chambres", title: "Répartition des chambres", text: "Qui dort où, et quelles nuits quand ce n'est pas tout le séjour." },
  { kind: "activites", title: "Planning des activités", text: "Le programme jour par jour avec les inscrits." },
  { kind: "infos", title: "Infos pratiques", text: "L'adresse et les consignes, à afficher à l'entrée ou sur le frigo." },
];

export default function PrintMenu() {
  const { slug, snap, idx } = useStay();
  const exportText = llmExport(snap, idx);
  return (
    <div className="stack">
      <h1 className="page-title">Imprimer & exporter</h1>
      <div className="print-cards">
        {PRINTS.map((p) => (
          <Link key={p.kind} to={`/s/${slug}/imprimer/${p.kind}`} className="card card-link">
            <h2>🖨 {p.title}</h2>
            <p className="muted small">{p.text}</p>
          </Link>
        ))}
      </div>
      <section className="card">
        <div className="card-head">
          <h2>Liste de courses (export LLM)</h2>
          <CopyButton text={exportText} />
        </div>
        <p className="muted small">
          Menus × couverts, prêts à coller dans ChatGPT, Claude… pour générer la liste de courses ou un panier drive.
          Régimes et allergies y figurent en nombres, sans les noms ; les précisions sont recopiées telles quelles.
        </p>
        <textarea className="export" readOnly value={exportText} rows={10} onFocus={(e) => e.target.select()} />
      </section>
    </div>
  );
}
