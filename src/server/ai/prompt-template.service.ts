import { prisma } from '@/lib/prisma';
import { createChildLogger } from '@/lib/logger';

const log = createChildLogger('prompt-template-service');

/**
 * Service for managing and rendering prompt templates.
 */
export class PromptTemplateService {
  /**
   * Get the active template for a given type and workspace.
   */
  async getActiveTemplate(
    workspaceId: string,
    templateType: 'SYSTEM' | 'PARAGRAPH_EXPLANATION' | 'REPAIR'
  ): Promise<{ content: string; version: string } | null> {
    const template = await prisma.promptTemplate.findFirst({
      where: {
        workspaceId,
        templateType,
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!template) return null;

    return { content: template.content, version: template.version };
  }

  /**
   * Render a template with variables.
   * Supports {{variable}} and {{#if variable}}...{{/if}} blocks.
   */
  render(
    template: string,
    variables: Record<string, string | boolean | undefined>
  ): string {
    let result = template;

    // Handle conditional blocks: {{#if var}}content{{/if}}
    result = result.replace(
      /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_, varName, content) => {
        const value = variables[varName];
        if (value && value !== '') {
          return content;
        }
        return '';
      }
    );

    // Handle variable substitution: {{variable}}
    result = result.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
      const value = variables[varName];
      if (value === undefined || value === false) return '';
      if (typeof value === 'boolean') return String(value);
      return value;
    });

    // Clean up excess whitespace
    result = result.replace(/\n{3,}/g, '\n\n').trim();

    return result;
  }

  /**
   * Get all templates for a workspace.
   */
  async getTemplates(workspaceId: string) {
    return prisma.promptTemplate.findMany({
      where: { workspaceId },
      orderBy: [{ templateType: 'asc' }, { version: 'desc' }],
    });
  }

  /**
   * Update a template.
   */
  async updateTemplate(
    id: string,
    workspaceId: string,
    data: {
      name?: string;
      content?: string;
      description?: string;
      isActive?: boolean;
      version?: string;
    }
  ) {
    // If activating, deactivate others of same type
    if (data.isActive) {
      const template = await prisma.promptTemplate.findUnique({
        where: { id },
      });

      if (template) {
        await prisma.promptTemplate.updateMany({
          where: {
            workspaceId,
            templateType: template.templateType,
            isActive: true,
            NOT: { id },
          },
          data: { isActive: false },
        });
      }
    }

    return prisma.promptTemplate.update({
      where: { id },
      data,
    });
  }

  /**
   * Create a new version of a template.
   */
  async createVersion(
    workspaceId: string,
    templateType: 'SYSTEM' | 'PARAGRAPH_EXPLANATION' | 'REPAIR',
    data: {
      name: string;
      content: string;
      version: string;
      description?: string;
      isActive?: boolean;
    }
  ) {
    if (data.isActive) {
      await prisma.promptTemplate.updateMany({
        where: {
          workspaceId,
          templateType,
          isActive: true,
        },
        data: { isActive: false },
      });
    }

    return prisma.promptTemplate.create({
      data: {
        workspaceId,
        templateType,
        ...data,
        isActive: data.isActive ?? false,
      },
    });
  }
}

export const promptTemplateService = new PromptTemplateService();
