-- LEXIO 2.0 (lot 2, second passage par le clausier MONETA) — à exécuter UNE FOIS dans l'éditeur SQL de Neon
-- (projet gentle-firefly-91584148), AVANT d'envoyer les nouveaux fichiers. Peut être rejoué sans dommage.
-- Toujours aucun texte d'acte : seulement, pour chaque clause étoile confrontée, la rubrique, l'écart et le feu.
ALTER TABLE lexio_examen ADD COLUMN IF NOT EXISTS clauses           jsonb NOT NULL DEFAULT '[]';
ALTER TABLE lexio_examen ADD COLUMN IF NOT EXISTS nb_clauses_rouges int   NOT NULL DEFAULT 0;
