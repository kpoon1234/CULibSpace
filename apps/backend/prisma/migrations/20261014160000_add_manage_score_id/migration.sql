-- Give each audit entry its own identity so entries written in the same
-- millisecond for the same user and admin cannot collide.
BEGIN;

ALTER TABLE "manage_score" ADD COLUMN "manage_score_id" INTEGER;

CREATE SEQUENCE "manage_score_manage_score_id_seq"
  OWNED BY "manage_score"."manage_score_id";

ALTER TABLE "manage_score"
  ALTER COLUMN "manage_score_id" SET DEFAULT nextval('manage_score_manage_score_id_seq');

-- Backfill existing logs before enforcing the new primary key.
UPDATE "manage_score"
SET "manage_score_id" = nextval('manage_score_manage_score_id_seq')
WHERE "manage_score_id" IS NULL;

ALTER TABLE "manage_score"
  ALTER COLUMN "manage_score_id" SET NOT NULL,
  DROP CONSTRAINT "manage_score_pkey",
  ADD CONSTRAINT "manage_score_pkey" PRIMARY KEY ("manage_score_id");

CREATE INDEX "manage_score_uid_timestamp_idx" ON "manage_score"("uid", "timestamp");

COMMIT;
