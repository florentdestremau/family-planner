/** Propriétés CSS personnalisées passées en `style` (ce fichier est un module : il complète les types de React). */
export type CustomProperties = {
  /** Teinte d'une personne, de 0 à 11 (`personHue`). */
  "--hue"?: number;
};

declare module "react" {
  interface CSSProperties extends CustomProperties {}
}
