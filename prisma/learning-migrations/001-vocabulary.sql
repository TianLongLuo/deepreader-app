-- CreateTable
CREATE TABLE "vocabulary_senses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "lemma" TEXT NOT NULL,
    "senseKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unresolved',
    "meaningEn" TEXT NOT NULL DEFAULT '',
    "meaningZh" TEXT NOT NULL DEFAULT '',
    "manualMeaningEn" TEXT,
    "manualMeaningZh" TEXT,
    "pos" TEXT NOT NULL DEFAULT '',
    "semanticCategory" TEXT NOT NULL DEFAULT '',
    "domain" TEXT,
    "encounterContext" TEXT NOT NULL DEFAULT '',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "manualTagsJson" TEXT,
    "collocationsJson" TEXT NOT NULL DEFAULT '[]',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vocabulary_senses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vocabulary_senses_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vocabulary_encounters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "senseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "readingEntryId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "targetSentence" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "rawNote" TEXT NOT NULL,
    "legacyContextMeaning" TEXT NOT NULL DEFAULT '',
    "dictionaryJson" TEXT NOT NULL DEFAULT 'null',
    "phonetic" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vocabulary_encounters_senseId_fkey" FOREIGN KEY ("senseId") REFERENCES "vocabulary_senses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vocabulary_encounters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vocabulary_encounters_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vocabulary_encounters_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vocabulary_encounters_readingEntryId_fkey" FOREIGN KEY ("readingEntryId") REFERENCES "reading_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "review_cards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "senseId" TEXT NOT NULL,
    "ability" TEXT NOT NULL DEFAULT 'recognition',
    "stateJson" TEXT NOT NULL,
    "due" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_cards_senseId_fkey" FOREIGN KEY ("senseId") REFERENCES "vocabulary_senses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "review_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "reviewedAt" DATETIME NOT NULL,
    "beforeJson" TEXT NOT NULL,
    "afterJson" TEXT NOT NULL,
    "logJson" TEXT NOT NULL,
    CONSTRAINT "review_logs_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "review_cards" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "review_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "review_logs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "review_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "cardVersion" INTEGER NOT NULL,
    "senseRevision" INTEGER NOT NULL,
    "definitionLanguage" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revealedAt" DATETIME,
    CONSTRAINT "review_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "review_sessions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "review_sessions_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "review_cards" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "review_sessions_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "vocabulary_encounters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "vocabulary_senses_userId_workspaceId_createdAt_idx" ON "vocabulary_senses"("userId", "workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_senses_userId_workspaceId_sourceLanguage_lemma_senseKey_key" ON "vocabulary_senses"("userId", "workspaceId", "sourceLanguage", "lemma", "senseKey");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_encounters_readingEntryId_key" ON "vocabulary_encounters"("readingEntryId");

-- CreateIndex
CREATE INDEX "vocabulary_encounters_userId_workspaceId_documentId_idx" ON "vocabulary_encounters"("userId", "workspaceId", "documentId");

-- CreateIndex
CREATE INDEX "review_cards_due_idx" ON "review_cards"("due");

-- CreateIndex
CREATE UNIQUE INDEX "review_cards_senseId_ability_key" ON "review_cards"("senseId", "ability");

-- CreateIndex
CREATE INDEX "review_logs_cardId_reviewedAt_idx" ON "review_logs"("cardId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_logs_userId_workspaceId_operationId_key" ON "review_logs"("userId", "workspaceId", "operationId");

-- CreateIndex
CREATE INDEX "review_sessions_userId_workspaceId_expiresAt_idx" ON "review_sessions"("userId", "workspaceId", "expiresAt");

