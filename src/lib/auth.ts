import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';
import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { appConfigService } from '@/server/app-config/app-config.service';

const log = createChildLogger('auth');

export const SESSION_DURATION_DAYS = 15;
export const SESSION_COOKIE_MAX_AGE_SECONDS =
  SESSION_DURATION_DAYS * 24 * 60 * 60;
const SESSION_DURATION_MS = SESSION_COOKIE_MAX_AGE_SECONDS * 1000;
const SALT_ROUNDS = 12;

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  workspaceId: string | null;
}

/**
 * Register a new user with email and password.
 */
export async function registerUser(
  email: string,
  password: string,
  name?: string
): Promise<AuthUser> {
  const publicConfig = await appConfigService.getPublicConfig();
  if (!publicConfig.allowRegistrations) {
    throw new Error('Registration is currently closed');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const newUser = await tx.user.create({
      data: {
        email,
        passwordHash,
        name: name || email.split('@')[0],
        role: 'USER',
      },
    });

    // Create a default workspace for the user
    const workspace = await tx.workspace.create({
      data: {
        name: `${newUser.name}'s Workspace`,
        members: {
          create: {
            userId: newUser.id,
            role: 'OWNER',
          },
        },
      },
    });

    // Create default user preferences
    await tx.userPreference.create({
      data: {
        userId: newUser.id,
        workspaceId: workspace.id,
      },
    });

    // Create default prompt templates
    await tx.promptTemplate.createMany({
      data: [
        {
          workspaceId: workspace.id,
          templateType: 'SYSTEM',
          version: '1.0.0',
          name: 'Default System Prompt',
          content: getDefaultSystemPrompt(),
          isActive: true,
          description: 'Default system prompt for paragraph explanations',
        },
        {
          workspaceId: workspace.id,
          templateType: 'PARAGRAPH_EXPLANATION',
          version: '1.0.0',
          name: 'Default Explanation Prompt',
          content: getDefaultExplanationPrompt(),
          isActive: true,
          description: 'Default prompt template for paragraph-level explanations',
        },
        {
          workspaceId: workspace.id,
          templateType: 'REPAIR',
          version: '1.0.0',
          name: 'Default Repair Prompt',
          content: getDefaultRepairPrompt(),
          isActive: true,
          description: 'Prompt for repairing malformed JSON responses',
        },
      ],
    });

    return { user: newUser, workspaceId: workspace.id };
  });

  log.info({ userId: user.user.id, email }, 'User registered');

  return {
    id: user.user.id,
    email: user.user.email,
    name: user.user.name,
    role: user.user.role,
    workspaceId: user.workspaceId,
  };
}

/**
 * Authenticate a user with email and password.
 */
export async function loginUser(
  email: string,
  password: string
): Promise<{ user: AuthUser; token: string }> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      workspaceMembers: {
        include: { workspace: true },
        take: 1,
      },
    },
  });

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid email or password');
  }

  // Create session
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  const workspaceId = user.workspaceMembers[0]?.workspace?.id || null;

  log.info({ userId: user.id, email }, 'User logged in');

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      workspaceId,
    },
    token,
  };
}

/**
 * Get the current authenticated user from session token.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session_token')?.value;
    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            workspaceMembers: {
              include: { workspace: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } });
      }
      return null;
    }

    const workspaceId = session.user.workspaceMembers[0]?.workspace?.id || null;

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      workspaceId,
    };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'digest' in error &&
      (error as { digest?: string }).digest === 'DYNAMIC_SERVER_USAGE'
    ) {
      throw error;
    }

    log.error({ error }, 'Error getting current user');
    return null;
  }
}

/**
 * Validate that a user is authenticated, throw if not.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

/**
 * Require admin role.
 */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth();

  if (user.role !== 'ADMIN' && user.email !== 'admin@qq.com') {
    throw new Error('Admin access required');
  }

  return user;
}

/**
 * Log out the current user.
 */
export async function logoutUser(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
}

// ============================================================
// Default Prompt Templates
// ============================================================

function getDefaultSystemPrompt(): string {
  return `You are an expert reading assistant and literary analyst. Your role is to help readers deeply understand individual paragraphs from books and documents.

You provide structured, detailed explanations that cover:
- Literal meaning and plain language restatement
- Sentence structure and grammatical roles
- Key vocabulary with definitions and usage notes
- Grammar patterns worth noting
- Tone, subtext, and implied meaning
- Translation when bilingual mode is enabled

Always respond in valid JSON format matching the required schema exactly.
Be precise, educational, and insightful. Avoid generic summaries — focus on deep paragraph-level understanding.`;
}

function getDefaultExplanationPrompt(): string {
  return `Analyze the following paragraph in detail. Provide a structured explanation in valid JSON format.

{{#if previousParagraph}}
PREVIOUS CONTEXT:
"""
{{previousParagraph}}
"""
{{/if}}

PARAGRAPH TO ANALYZE:
"""
{{paragraph}}
"""

{{#if nextParagraph}}
FOLLOWING CONTEXT:
"""
{{nextParagraph}}
"""
{{/if}}

{{#if bilingualMode}}
Include translation in {{explanationLanguage}}.
{{/if}}

{{#if grammarMode}}
Include detailed grammar notes.
{{/if}}

Respond with ONLY valid JSON matching this exact schema:
{
  "paragraph_summary": "A concise summary of what this paragraph says",
  "plain_meaning": "A plain-language restatement of the paragraph",
  "sentence_roles": [
    {
      "text": "the exact text segment",
      "role": "subject|verb|object|modifier|clause|phrase",
      "start_offset": 0,
      "end_offset": 10,
      "label": "descriptive label",
      "explanation": "why this has this role"
    }
  ],
  "who_did_what": [
    {
      "actor": "who",
      "action": "did what",
      "target": "to whom/what",
      "extra": "additional context"
    }
  ],
  "vocabulary_notes": [
    {
      "term": "word or phrase",
      "meaning": "definition",
      "translation": "translation if bilingual",
      "usage_note": "how it is used here"
    }
  ],
  "grammar_notes": [
    {
      "pattern": "grammar pattern name",
      "explanation": "how it works in this context"
    }
  ],
  "tone_or_subtext": "description of tone and any implied meaning",
  "translation": "full translation if bilingual mode",
  "reading_tip": "a helpful tip for understanding this paragraph"
}`;
}

function getDefaultRepairPrompt(): string {
  return `The following JSON response is malformed. Please fix it to be valid JSON matching the required schema.

ORIGINAL RESPONSE:
"""
{{malformedResponse}}
"""

Return ONLY the corrected valid JSON. Do not include any text outside the JSON object.`;
}
