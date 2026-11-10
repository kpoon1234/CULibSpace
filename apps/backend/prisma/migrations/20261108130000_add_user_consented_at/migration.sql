-- AlterTable
ALTER TABLE "user" ADD COLUMN "consented_at" TIMESTAMP(3),
ADD COLUMN "consent_version" VARCHAR(20);
