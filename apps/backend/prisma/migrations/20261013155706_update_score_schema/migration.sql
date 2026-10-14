-- Preserve existing score values and booking thresholds while moving to whole points.
-- ROUND uses the nearest integer for legacy decimal values (e.g. 95.5 -> 96).
ALTER TABLE "manage_score"
ADD COLUMN "reason" TEXT NOT NULL DEFAULT 'System Adjustment';

ALTER TABLE "system_config"
ALTER COLUMN "min_score_to_book" DROP DEFAULT,
ALTER COLUMN "min_score_to_book" SET DATA TYPE INTEGER
USING ROUND("min_score_to_book")::INTEGER,
ALTER COLUMN "min_score_to_book" SET DEFAULT 50;

ALTER TABLE "user"
ALTER COLUMN "behaviour_score" DROP DEFAULT,
ALTER COLUMN "behaviour_score" SET DATA TYPE INTEGER
USING ROUND("behaviour_score")::INTEGER,
ALTER COLUMN "behaviour_score" SET DEFAULT 100;
