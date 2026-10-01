-- CreateTable
CREATE TABLE "learning_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "definitionLanguage" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 250,
    "targetCount" INTEGER NOT NULL DEFAULT 6,
    "targetsJson" TEXT NOT NULL,
    "deferredJson" TEXT NOT NULL DEFAULT '[]',
    "domain" TEXT,
    "passage" TEXT NOT NULL DEFAULT '',
    "questionsJson" TEXT NOT NULL DEFAULT '[]',
    "answerKeyJson" TEXT NOT NULL DEFAULT '[]',
    "applicationPrompt" TEXT NOT NULL DEFAULT '',
    "validationJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'generating',
    "version" INTEGER NOT NULL DEFAULT 0,
    "usedHint" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "learning_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "learning_responses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "responseJson" TEXT NOT NULL,
    "feedbackJson" TEXT NOT NULL DEFAULT '{}',
    "usedHint" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "previousResponseId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "learning_responses_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "learning_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_responses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_responses_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "learning_evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "responseId" TEXT NOT NULL,
    "senseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "result" BOOLEAN,
    "reason" TEXT NOT NULL,
    "usedHint" BOOLEAN NOT NULL DEFAULT false,
    "disputed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_evidence_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "learning_responses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_evidence_senseId_fkey" FOREIGN KEY ("senseId") REFERENCES "vocabulary_senses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "learning_tasks_userId_workspaceId_createdAt_idx" ON "learning_tasks"("userId", "workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "learning_responses_taskId_createdAt_idx" ON "learning_responses"("taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "learning_responses_userId_workspaceId_operationId_key" ON "learning_responses"("userId", "workspaceId", "operationId");

-- CreateIndex
CREATE INDEX "learning_evidence_senseId_kind_createdAt_idx" ON "learning_evidence"("senseId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "learning_evidence_responseId_senseId_kind_key" ON "learning_evidence"("responseId", "senseId", "kind");

