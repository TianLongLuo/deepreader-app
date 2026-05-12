import { prisma } from '@/lib/prisma';
import { appConfigService } from '@/server/app-config/app-config.service';
import { getStorageProvider } from '@/server/storage';

type ConsoleUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
  passwordHash: string;
  lastLoginAt: Date | null;
  deepseekCalls: number;
  storageBytes: number;
  books: Array<{
    id: string;
    title: string;
    fileType: string;
    fileSize: number;
    createdAt: Date;
  }>;
};

export class DracConsoleService {
  async getSnapshot() {
    const [users, latestSession, totalDeepSeekCalls, adminConfig] =
      await Promise.all([
        prisma.user.findMany({
          orderBy: { createdAt: 'desc' },
          include: {
            sessions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { createdAt: true },
            },
            documents: {
              where: { status: { not: 'DELETED' } },
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                title: true,
                fileType: true,
                fileSize: true,
                createdAt: true,
              },
            },
          },
        }),
        prisma.session.findFirst({
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { email: true, name: true },
            },
          },
        }),
        prisma.paragraphExplanation.count({
          where: { provider: { in: ['deepseek', 'gemini'] }, status: 'COMPLETED' },
        }),
        appConfigService.getAdminConfig(),
      ]);

    const usersWithStats: ConsoleUserRow[] = await Promise.all(
      users.map(async (user) => {
        const deepseekCalls = await prisma.paragraphExplanation.count({
          where: {
            provider: { in: ['deepseek', 'gemini'] },
            status: 'COMPLETED',
            paragraph: {
              document: {
                userId: user.id,
              },
            },
          },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt,
          passwordHash: user.passwordHash,
          lastLoginAt: user.sessions[0]?.createdAt ?? null,
          deepseekCalls,
          storageBytes: user.documents.reduce(
            (total, document) => total + document.fileSize,
            0
          ),
          books: user.documents,
        };
      })
    );

    return {
      adminConfig,
      totals: {
        registeredUsers: users.length,
        deepseekCalls: totalDeepSeekCalls,
        books: usersWithStats.reduce((count, user) => count + user.books.length, 0),
      },
      latestLogin: latestSession
        ? {
            at: latestSession.createdAt.toISOString(),
            email: latestSession.user.email,
            name: latestSession.user.name,
          }
        : null,
      users: usersWithStats.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        storageBytes: user.storageBytes,
        books: user.books.map((book) => ({
          ...book,
          createdAt: book.createdAt.toISOString(),
        })),
      })),
    };
  }

  async deleteUser(targetUserId: string, actingUserId: string) {
    if (targetUserId === actingUserId) {
      throw new Error('You cannot delete the account currently using dracconsole.');
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        documents: {
          select: {
            id: true,
            storageKey: true,
          },
        },
        workspaceMembers: {
          select: {
            workspaceId: true,
            role: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const storage = getStorageProvider();
    for (const document of user.documents) {
      await storage.delete(document.storageKey);
    }

    const ownedWorkspaceIds = user.workspaceMembers
      .filter((membership) => membership.role === 'OWNER')
      .map((membership) => membership.workspaceId);

    if (ownedWorkspaceIds.length > 0) {
      await prisma.workspace.deleteMany({
        where: {
          id: { in: ownedWorkspaceIds },
        },
      });
    }

    await prisma.user.delete({
      where: { id: targetUserId },
    });

    return { success: true };
  }
}

export const dracConsoleService = new DracConsoleService();
