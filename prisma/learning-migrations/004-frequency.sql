-- AlterTable
ALTER TABLE "vocabulary_senses" ADD COLUMN "frequencyCheckedAt" DATETIME;
ALTER TABLE "vocabulary_senses" ADD COLUMN "frequencySource" TEXT;
ALTER TABLE "vocabulary_senses" ADD COLUMN "frequencyVersion" TEXT;
ALTER TABLE "vocabulary_senses" ADD COLUMN "frequencyZipf" REAL;

