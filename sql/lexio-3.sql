-- LEXIO 3.0 (lot 3) — à exécuter UNE FOIS dans l'éditeur SQL de Neon (projet gentle-firefly-91584148).
-- Historique des versions, profil du confrère, tolérance par dossier. Toujours aucun texte d'acte.
-- Sans risque si on le relance : chaque ajout vérifie d'abord que la colonne n'existe pas.

ALTER TABLE lexio_examen ADD COLUMN IF NOT EXISTS clauses jsonb NOT NULL DEFAULT '[]';
ALTER TABLE lexio_examen ADD COLUMN IF NOT EXISTS nb_clauses_rouges int NOT NULL DEFAULT 0;

-- l'examen précédent du même dossier, confirmé d'un clic (« Suite de l'examen du … »)
ALTER TABLE lexio_examen ADD COLUMN IF NOT EXISTS suite_de int REFERENCES lexio_examen(id) ON DELETE SET NULL;
-- le cran de tolérance retenu pour le dossier : souple, normal ou strict
ALTER TABLE lexio_examen ADD COLUMN IF NOT EXISTS tolerance text NOT NULL DEFAULT 'normal';
-- les points obtenus lors des versions précédentes, revérifiés : intitulé de la demande et état (maintenu, disparu, incertain)
ALTER TABLE lexio_examen ADD COLUMN IF NOT EXISTS obtenus jsonb NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS lexio_examen_suite ON lexio_examen (suite_de);

GRANT SELECT, INSERT, UPDATE ON lexio_examen, lexio_confrere TO "matrice_owner";
