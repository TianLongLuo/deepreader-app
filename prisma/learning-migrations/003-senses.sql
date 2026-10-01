-- AlterTable
ALTER TABLE "vocabulary_senses" ADD COLUMN "confirmedDictionaryId" TEXT;

-- AlterTable
ALTER TABLE "review_cards" ADD COLUMN "archivedAt" DATETIME;

-- AlterTable
ALTER TABLE "enrichment_jobs" ADD COLUMN "targetSenseId" TEXT;

-- CreateTable
CREATE TABLE "sense_changes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "sourceIdsJson" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "encounterIdsJson" TEXT NOT NULL,
    "detailJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sense_changes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sense_changes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "sense_changes_userId_workspaceId_createdAt_idx" ON "sense_changes"("userId", "workspaceId", "createdAt");

