-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workspace_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "parseStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "language" TEXT,
    "pageCount" INTEGER,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "documents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "document_sections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "parentSectionId" TEXT,
    "title" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "anchor" TEXT NOT NULL,
    "metadataJson" TEXT,
    CONSTRAINT "document_sections_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "document_sections_parentSectionId_fkey" FOREIGN KEY ("parentSectionId") REFERENCES "document_sections" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "paragraphs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "sectionId" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "pageNumber" INTEGER,
    "rawText" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "metadataJson" TEXT,
    CONSTRAINT "paragraphs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "paragraphs_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "document_sections" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sentences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paragraphId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "rawText" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    CONSTRAINT "sentences_paragraphId_fkey" FOREIGN KEY ("paragraphId") REFERENCES "paragraphs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "paragraph_explanations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paragraphId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "settingsHash" TEXT NOT NULL,
    "outputJson" TEXT NOT NULL,
    "rawPromptEncrypted" TEXT,
    "rawResponseEncrypted" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "paragraph_explanations_paragraphId_fkey" FOREIGN KEY ("paragraphId") REFERENCES "paragraphs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "annotation_spans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paragraphExplanationId" TEXT NOT NULL,
    "sentenceId" TEXT,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "spanType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "colorKey" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    CONSTRAINT "annotation_spans_paragraphExplanationId_fkey" FOREIGN KEY ("paragraphExplanationId") REFERENCES "paragraph_explanations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "annotation_spans_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "sentences" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vocabulary_notes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paragraphExplanationId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "lemma" TEXT,
    "note" TEXT NOT NULL,
    "translation" TEXT,
    "difficultyLevel" TEXT,
    CONSTRAINT "vocabulary_notes_paragraphExplanationId_fkey" FOREIGN KEY ("paragraphExplanationId") REFERENCES "paragraph_explanations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ai_provider_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "baseUrl" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "maskedApiKeyPreview" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" REAL NOT NULL DEFAULT 0.3,
    "maxTokens" INTEGER NOT NULL DEFAULT 384000,
    "topP" REAL NOT NULL DEFAULT 1.0,
    "timeoutMs" INTEGER NOT NULL DEFAULT 300000,
    "retryCount" INTEGER NOT NULL DEFAULT 2,
    "streamingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "saveRawPrompt" BOOLEAN NOT NULL DEFAULT false,
    "saveRawResponse" BOOLEAN NOT NULL DEFAULT false,
    "saveRequestInput" BOOLEAN NOT NULL DEFAULT false,
    "cacheEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "lastTestedAt" DATETIME,
    "lastTestStatus" TEXT,
    "lastTestMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ai_provider_configs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "prompt_templates_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "preferredExplanationLanguage" TEXT NOT NULL DEFAULT 'en',
    "preferredBilingualMode" BOOLEAN NOT NULL DEFAULT false,
    "preferredGrammarMode" BOOLEAN NOT NULL DEFAULT true,
    "preferredAnnotationLayers" TEXT NOT NULL DEFAULT '[]',
    "readerTheme" TEXT NOT NULL DEFAULT 'dark',
    "savedDraftJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_preferences_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ai_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ai_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reading_progress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "percentage" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "reading_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reading_progress_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reading_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dedupKey" TEXT,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewAt" DATETIME,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "reading_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reading_entries_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "auth_attempts" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspaceId_userId_key" ON "workspace_members"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "documents_workspaceId_idx" ON "documents"("workspaceId");

-- CreateIndex
CREATE INDEX "documents_userId_idx" ON "documents"("userId");

-- CreateIndex
CREATE INDEX "document_sections_documentId_idx" ON "document_sections"("documentId");

-- CreateIndex
CREATE INDEX "document_sections_parentSectionId_idx" ON "document_sections"("parentSectionId");

-- CreateIndex
CREATE INDEX "paragraphs_documentId_idx" ON "paragraphs"("documentId");

-- CreateIndex
CREATE INDEX "paragraphs_sectionId_idx" ON "paragraphs"("sectionId");

-- CreateIndex
CREATE INDEX "paragraphs_textHash_idx" ON "paragraphs"("textHash");

-- CreateIndex
CREATE INDEX "sentences_paragraphId_idx" ON "sentences"("paragraphId");

-- CreateIndex
CREATE INDEX "paragraph_explanations_paragraphId_idx" ON "paragraph_explanations"("paragraphId");

-- CreateIndex
CREATE INDEX "paragraph_explanations_settingsHash_idx" ON "paragraph_explanations"("settingsHash");

-- CreateIndex
CREATE INDEX "annotation_spans_paragraphExplanationId_idx" ON "annotation_spans"("paragraphExplanationId");

-- CreateIndex
CREATE INDEX "vocabulary_notes_paragraphExplanationId_idx" ON "vocabulary_notes"("paragraphExplanationId");

-- CreateIndex
CREATE INDEX "ai_provider_configs_workspaceId_idx" ON "ai_provider_configs"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_configs_workspaceId_providerKey_key" ON "ai_provider_configs"("workspaceId", "providerKey");

-- CreateIndex
CREATE INDEX "prompt_templates_workspaceId_idx" ON "prompt_templates"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_workspaceId_key" ON "user_preferences"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "ai_jobs_workspaceId_idx" ON "ai_jobs"("workspaceId");

-- CreateIndex
CREATE INDEX "ai_jobs_targetId_idx" ON "ai_jobs"("targetId");

-- CreateIndex
CREATE INDEX "ai_jobs_status_idx" ON "ai_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "reading_progress_userId_documentId_key" ON "reading_progress"("userId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "reading_entries_dedupKey_key" ON "reading_entries"("dedupKey");

-- CreateIndex
CREATE INDEX "reading_entries_userId_documentId_idx" ON "reading_entries"("userId", "documentId");

-- CreateIndex
CREATE INDEX "reading_entries_userId_kind_reviewAt_idx" ON "reading_entries"("userId", "kind", "reviewAt");

-- CreateIndex
CREATE INDEX "auth_attempts_expiresAt_idx" ON "auth_attempts"("expiresAt");

