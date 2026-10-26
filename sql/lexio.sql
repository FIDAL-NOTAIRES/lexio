-- LEXIO 1.0 — à exécuter UNE FOIS dans l'éditeur SQL de Neon (projet gentle-firefly-91584148).
-- Aucun texte d'acte n'est rangé ici : seulement le relevé de chaque examen.
GRANT USAGE, CREATE ON SCHEMA public TO "matrice_owner";

CREATE TABLE IF NOT EXISTS lexio_examen (
  id                      serial PRIMARY KEY,
  cree_le                 timestamptz NOT NULL DEFAULT now(),
  dossier                 text,
  type_acte               text,
  position                text,
  confrere_nom            text,
  confrere_adresse        text,
  auteur                  text,
  feu                     text,
  demandes                jsonb NOT NULL DEFAULT '[]',
  ajouts                  jsonb NOT NULL DEFAULT '[]',
  chiffres                jsonb NOT NULL DEFAULT '[]',
  nb_integrees            int NOT NULL DEFAULT 0,
  nb_partielles           int NOT NULL DEFAULT 0,
  nb_oubliees             int NOT NULL DEFAULT 0,
  nb_ajouts_defavorables  int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS lexio_examen_dossier ON lexio_examen (dossier, cree_le DESC);
CREATE INDEX IF NOT EXISTS lexio_examen_confrere ON lexio_examen (confrere_adresse, cree_le DESC);

CREATE TABLE IF NOT EXISTS lexio_confrere (
  adresse                 text PRIMARY KEY,
  nom                     text,
  premier_examen          timestamptz,
  dernier_examen          timestamptz,
  nb_examens              int NOT NULL DEFAULT 0,
  nb_oublis               int NOT NULL DEFAULT 0,
  nb_ajouts_defavorables  int NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT, UPDATE ON lexio_examen, lexio_confrere TO "matrice_owner";
GRANT USAGE, SELECT ON SEQUENCE lexio_examen_id_seq TO "matrice_owner";
