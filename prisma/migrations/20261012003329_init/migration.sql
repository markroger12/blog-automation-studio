-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EDITOR',
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BrowserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "directory" TEXT NOT NULL,
    "sessionState" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" DATETIME,
    "lastLoginAt" DATETIME,
    "diagnostics" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Website" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "adminUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "profileId" TEXT,
    "defaultCategoryId" TEXT,
    "editorType" TEXT NOT NULL DEFAULT 'AUTO',
    "detectedEditor" TEXT,
    "language" TEXT NOT NULL DEFAULT 'English',
    "targetCountry" TEXT NOT NULL DEFAULT 'United States',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "internalLinkLine" TEXT NOT NULL DEFAULT 'Also read:',
    "logoPath" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#2563eb',
    "imageSettings" TEXT NOT NULL DEFAULT '{}',
    "imageTemplate" TEXT NOT NULL DEFAULT '{}',
    "promptOverrides" TEXT NOT NULL DEFAULT '{}',
    "workflowSettings" TEXT NOT NULL DEFAULT '{}',
    "defaultWriter" TEXT NOT NULL DEFAULT 'celebrity-v1',
    "canPublish" BOOLEAN NOT NULL DEFAULT false,
    "canPublishAckAt" DATETIME,
    "searchConsoleProperty" TEXT,
    "queuePaused" BOOLEAN NOT NULL DEFAULT false,
    "queuePriority" INTEGER NOT NULL DEFAULT 0,
    "maxConcurrentTasks" INTEGER NOT NULL DEFAULT 2,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Website_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "BrowserProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "websiteId" TEXT NOT NULL,
    "externalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "parentExternalId" INTEGER,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "settings" TEXT NOT NULL DEFAULT '{}',
    "templateName" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CampaignImportRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "rawText" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "exampleTitle" TEXT,
    "secondaryKeywords" TEXT NOT NULL DEFAULT '[]',
    "categoryName" TEXT,
    "websiteId" TEXT,
    "writerOverride" TEXT,
    "predictedWriter" TEXT,
    "routerReason" TEXT,
    "routerConfidence" REAL,
    "language" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "publicationSlot" DATETIME,
    "notes" TEXT,
    "preflightStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "preflightIssues" TEXT NOT NULL DEFAULT '[]',
    "taskId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignImportRow_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArticleTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleKey" TEXT NOT NULL,
    "websiteId" TEXT,
    "categoryId" TEXT,
    "categoryName" TEXT,
    "campaignId" TEXT,
    "primaryKeyword" TEXT NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "exampleTitle" TEXT,
    "secondaryKeywords" TEXT NOT NULL DEFAULT '[]',
    "targetCountry" TEXT NOT NULL DEFAULT 'United States',
    "language" TEXT NOT NULL DEFAULT 'English',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "errors" TEXT NOT NULL DEFAULT '[]',
    "reviewReasons" TEXT NOT NULL DEFAULT '[]',
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "titleOptions" TEXT NOT NULL DEFAULT '[]',
    "recommendedTitle" TEXT,
    "selectedTitle" TEXT,
    "titleApprovedAt" DATETIME,
    "articleApprovedAt" DATETIME,
    "researchSnapshot" TEXT,
    "outputSnapshot" TEXT,
    "bodyHtml" TEXT,
    "assembledHtml" TEXT,
    "faqs" TEXT NOT NULL DEFAULT '[]',
    "quickBio" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "seoTitle" TEXT,
    "metaDescription" TEXT,
    "slug" TEXT,
    "focusKeyword" TEXT,
    "seoScore" INTEGER,
    "rankMathScore" INTEGER,
    "metrics" TEXT NOT NULL DEFAULT '{}',
    "configSnapshot" TEXT NOT NULL DEFAULT '{}',
    "conversationUrl" TEXT,
    "wpPostId" INTEGER,
    "wpEditUrl" TEXT,
    "wpDraftAt" DATETIME,
    "wpStatus" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "chatgptInteractions" INTEGER NOT NULL DEFAULT 0,
    "verifiedCompleteAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArticleTask_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ArticleTask_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArticleStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "inputSnapshot" TEXT,
    "promptVersion" TEXT,
    "prompt" TEXT,
    "output" TEXT,
    "outputHtml" TEXT,
    "outputJson" TEXT,
    "error" TEXT,
    "privateState" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "durationMs" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArticleStage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ArticleTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArticleStageHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "prompt" TEXT,
    "output" TEXT,
    "outputHtml" TEXT,
    "outputJson" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArticleStageHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ArticleTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatGPTResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT,
    "stageKey" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "operationId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "resultText" TEXT,
    "resultHtml" TEXT,
    "conversationUrl" TEXT,
    "fingerprint" TEXT,
    "recovered" BOOLEAN NOT NULL DEFAULT false,
    "elapsedMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "ChatGPTResponse_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ArticleTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleKey" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "defaultHash" TEXT NOT NULL,
    "defaultVersion" INTEGER NOT NULL DEFAULT 1,
    "variables" TEXT NOT NULL DEFAULT '[]',
    "customized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PromptTemplateHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromptTemplateHistory_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PromptTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QueueJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queue" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "taskId" TEXT,
    "relatedId" TEXT,
    "websiteId" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "result" TEXT,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" DATETIME,
    "lockedBy" TEXT,
    "heartbeatAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "operationKey" TEXT NOT NULL,
    "sideEffect" TEXT NOT NULL DEFAULT 'NONE',
    "lastError" TEXT,
    "tabId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "WorkerLock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workerId" TEXT NOT NULL,
    "pid" INTEGER NOT NULL,
    "hostname" TEXT NOT NULL,
    "heartbeatAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "acquiredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WorkerStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "version" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "capabilities" TEXT NOT NULL DEFAULT '[]',
    "diagnostics" TEXT NOT NULL DEFAULT '{}',
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ExtensionKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "stage" TEXT,
    "taskId" TEXT,
    "message" TEXT NOT NULL,
    "details" TEXT,
    "screenshot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Log_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ArticleTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SEOReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "checks" TEXT NOT NULL,
    "metrics" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SEOReport_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ArticleTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "websiteId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "writerPreference" TEXT NOT NULL DEFAULT 'AUTO',
    "weekdays" TEXT NOT NULL DEFAULT '[]',
    "slots" TEXT NOT NULL DEFAULT '[]',
    "writeAheadHours" INTEGER NOT NULL DEFAULT 24,
    "maxBacklog" INTEGER NOT NULL DEFAULT 10,
    "imageOverride" TEXT NOT NULL DEFAULT 'inherit',
    "requestIndexing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Workflow_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowKeyword" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "title" TEXT,
    "secondaryKeywords" TEXT NOT NULL DEFAULT '[]',
    "writerType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "detectionReason" TEXT,
    "position" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "taskId" TEXT,
    "scheduledAt" DATETIME,
    "publishedUrl" TEXT,
    "publishedAt" DATETIME,
    "indexingRequestedAt" DATETIME,
    "indexingStatus" TEXT,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowKeyword_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduleSlotReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "websiteId" TEXT NOT NULL,
    "slotUtc" DATETIME NOT NULL,
    "keywordId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ArticleQualityReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "hardStops" TEXT NOT NULL DEFAULT '[]',
    "warnings" TEXT NOT NULL DEFAULT '[]',
    "checks" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArticleQualityReport_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ArticleTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "domain" TEXT NOT NULL,
    "trustTier" INTEGER NOT NULL DEFAULT 2,
    "fetchedAt" DATETIME,
    "httpStatus" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ClaimEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "claimType" TEXT NOT NULL,
    "sourceId" TEXT,
    "excerpt" TEXT,
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" REAL NOT NULL DEFAULT 0,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "articleLocation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClaimEvidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ArticleTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClaimEvidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SourceRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentFingerprint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "websiteId" TEXT,
    "kind" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "excerpt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentFingerprint_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ArticleTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InternalLinkIndex" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "websiteId" TEXT NOT NULL,
    "wpPostId" INTEGER,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "categoryName" TEXT,
    "headings" TEXT NOT NULL DEFAULT '[]',
    "primaryKeyword" TEXT,
    "status" TEXT NOT NULL DEFAULT 'publish',
    "updatedRemoteAt" DATETIME,
    "lastVerifiedAt" DATETIME,
    "broken" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InternalLinkIndex_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SuggestedInternalLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "targetTitle" TEXT NOT NULL,
    "anchor" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SuggestedInternalLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ArticleTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefreshCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT,
    "websiteId" TEXT NOT NULL,
    "url" TEXT,
    "reasons" TEXT NOT NULL DEFAULT '[]',
    "evidence" TEXT NOT NULL DEFAULT '[]',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ContentRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "beforeHtml" TEXT,
    "afterHtml" TEXT,
    "diff" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentRevision_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ArticleTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SearchPerformanceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "websiteId" TEXT NOT NULL,
    "property" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "page" TEXT,
    "query" TEXT,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" REAL NOT NULL,
    "position" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SearchPerformanceSnapshot_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT,
    "websiteId" TEXT,
    "moduleKey" TEXT,
    "stageKey" TEXT,
    "kind" TEXT NOT NULL,
    "valueMs" INTEGER,
    "count" INTEGER NOT NULL DEFAULT 1,
    "appVersion" TEXT NOT NULL DEFAULT '3.0.0',
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT
);

-- CreateTable
CREATE TABLE "RecoveryIncident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT,
    "jobId" TEXT,
    "stageKey" TEXT,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resolution" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "details" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "RecoveryIncident_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ArticleTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SiteHealthObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "websiteId" TEXT NOT NULL,
    "check" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "message" TEXT,
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteHealthObservation_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BrowserProfile_directory_key" ON "BrowserProfile"("directory");

-- CreateIndex
CREATE UNIQUE INDEX "Website_slug_key" ON "Website"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_websiteId_externalId_key" ON "Category"("websiteId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_websiteId_name_key" ON "Category"("websiteId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignImportRow_taskId_key" ON "CampaignImportRow"("taskId");

-- CreateIndex
CREATE INDEX "CampaignImportRow_campaignId_position_idx" ON "CampaignImportRow"("campaignId", "position");

-- CreateIndex
CREATE INDEX "CampaignImportRow_normalizedKeyword_idx" ON "CampaignImportRow"("normalizedKeyword");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleTask_idempotencyKey_key" ON "ArticleTask"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ArticleTask_status_idx" ON "ArticleTask"("status");

-- CreateIndex
CREATE INDEX "ArticleTask_websiteId_status_idx" ON "ArticleTask"("websiteId", "status");

-- CreateIndex
CREATE INDEX "ArticleTask_normalizedKeyword_idx" ON "ArticleTask"("normalizedKeyword");

-- CreateIndex
CREATE INDEX "ArticleTask_createdAt_idx" ON "ArticleTask"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleStage_taskId_stageKey_key" ON "ArticleStage"("taskId", "stageKey");

-- CreateIndex
CREATE INDEX "ArticleStageHistory_taskId_stageKey_idx" ON "ArticleStageHistory"("taskId", "stageKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChatGPTResponse_operationId_key" ON "ChatGPTResponse"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_moduleKey_stageKey_key" ON "PromptTemplate"("moduleKey", "stageKey");

-- CreateIndex
CREATE UNIQUE INDEX "QueueJob_operationKey_key" ON "QueueJob"("operationKey");

-- CreateIndex
CREATE INDEX "QueueJob_queue_status_runAt_idx" ON "QueueJob"("queue", "status", "runAt");

-- CreateIndex
CREATE INDEX "QueueJob_taskId_idx" ON "QueueJob"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionKey_keyHash_key" ON "ExtensionKey"("keyHash");

-- CreateIndex
CREATE INDEX "Log_taskId_createdAt_idx" ON "Log"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "Log_createdAt_idx" ON "Log"("createdAt");

-- CreateIndex
CREATE INDEX "WorkflowKeyword_workflowId_position_idx" ON "WorkflowKeyword"("workflowId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleSlotReservation_keywordId_key" ON "ScheduleSlotReservation"("keywordId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleSlotReservation_websiteId_slotUtc_key" ON "ScheduleSlotReservation"("websiteId", "slotUtc");

-- CreateIndex
CREATE UNIQUE INDEX "SourceRecord_url_key" ON "SourceRecord"("url");

-- CreateIndex
CREATE INDEX "ClaimEvidence_taskId_idx" ON "ClaimEvidence"("taskId");

-- CreateIndex
CREATE INDEX "ContentFingerprint_hash_idx" ON "ContentFingerprint"("hash");

-- CreateIndex
CREATE INDEX "ContentFingerprint_taskId_idx" ON "ContentFingerprint"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "InternalLinkIndex_websiteId_url_key" ON "InternalLinkIndex"("websiteId", "url");

-- CreateIndex
CREATE INDEX "SearchPerformanceSnapshot_websiteId_date_idx" ON "SearchPerformanceSnapshot"("websiteId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionMetric_dedupeKey_key" ON "ProductionMetric"("dedupeKey");

-- CreateIndex
CREATE INDEX "ProductionMetric_kind_recordedAt_idx" ON "ProductionMetric"("kind", "recordedAt");

-- CreateIndex
CREATE INDEX "SiteHealthObservation_websiteId_observedAt_idx" ON "SiteHealthObservation"("websiteId", "observedAt");
