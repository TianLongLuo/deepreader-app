-- CreateTable
CREATE TABLE "enrichment_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "senseId" TEXT NOT NULL,
    "expectedRevision" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" DATETIME,
    "leaseToken" TEXT,
    "errorCode" TEXT,
    "progressJson" TEXT NOT NULL DEFAULT '{}',
    "eventVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "enrichment_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "enrichment_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "enrichment_jobs_senseId_fkey" FOREIGN KEY ("senseId") REFERENCES "vocabulary_senses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "word_exposures" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "lemma" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "word_exposures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "word_exposures_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "word_exposures_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "enrichment_jobs_status_availableAt_idx" ON "enrichment_jobs"("status", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "enrichment_jobs_senseId_expectedRevision_key" ON "enrichment_jobs"("senseId", "expectedRevision");

-- CreateIndex
CREATE INDEX "word_exposures_userId_workspaceId_sourceLanguage_lemma_idx" ON "word_exposures"("userId", "workspaceId", "sourceLanguage", "lemma");

-- CreateIndex
CREATE UNIQUE INDEX "word_exposures_userId_documentId_sourceLanguage_location_lemma_sourceHash_key" ON "word_exposures"("userId", "documentId", "sourceLanguage", "location", "lemma", "sourceHash");

