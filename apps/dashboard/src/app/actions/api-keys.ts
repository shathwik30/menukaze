'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { generateApiKey, getModels, getMongoConnection } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import {
  actionError,
  invalidEntityError,
  validationError,
  withRestaurantAction,
  type ActionResult,
} from '@/lib/action-helpers';
import { recordAudit } from '@/lib/audit';

const PERMISSION_ERROR = 'You do not have permission to manage API keys.';

const createInput = z.object({
  name: z.string().trim().min(1).max(120),
  scope: z.enum(['read_only', 'read_write', 'admin']).default('read_only'),
  env: z.enum(['live', 'test']).default('test'),
  icon: z.string().max(32).optional(),
  color: z.string().max(32).optional(),
  allowedOrigins: z.array(z.string().url().max(300)).max(20).default([]),
});

export interface CreatedApiKey {
  id: string;
  raw: string;
  prefix: string;
  lastFour: string;
  name: string;
}

export async function createApiKeyAction(raw: unknown): Promise<ActionResult<CreatedApiKey>> {
  const parsed = createInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    return await withRestaurantAction(
      ['api_keys.manage'],
      async ({ restaurantId, session, role }) => {
        const conn = await getMongoConnection('live');
        const { ApiKey } = getModels(conn);
        const generated = generateApiKey(parsed.data.env);
        const created = await ApiKey.create({
          restaurantId,
          name: parsed.data.name,
          scope: parsed.data.scope,
          env: parsed.data.env,
          ...(parsed.data.icon ? { icon: parsed.data.icon } : {}),
          ...(parsed.data.color ? { color: parsed.data.color } : {}),
          allowedOrigins: parsed.data.allowedOrigins,
          keyHash: generated.hash,
          prefix: generated.prefix,
          lastFour: generated.lastFour,
          createdByUserId: parseObjectId(session.user.id) ?? undefined,
        });

        await recordAudit({
          restaurantId,
          userId: session.user.id,
          userEmail: session.user.email,
          role,
          action: 'api_key.created',
          resourceType: 'api_key',
          resourceId: String(created._id),
          metadata: { name: parsed.data.name, scope: parsed.data.scope, env: parsed.data.env },
        });

        revalidatePath('/admin/api-keys');
        return {
          ok: true,
          data: {
            id: String(created._id),
            raw: generated.raw,
            prefix: generated.prefix,
            lastFour: generated.lastFour,
            name: parsed.data.name,
          },
        };
      },
    );
  } catch (error) {
    return actionError(error, 'Failed to create API key.', PERMISSION_ERROR);
  }
}

export async function revokeApiKeyAction(keyId: string): Promise<ActionResult> {
  const apiKeyObjectId = parseObjectId(keyId);
  if (!apiKeyObjectId) return invalidEntityError('api_key');

  try {
    return await withRestaurantAction(
      ['api_keys.manage'],
      async ({ restaurantId, session, role }) => {
        const conn = await getMongoConnection('live');
        const { ApiKey } = getModels(conn);
        await ApiKey.updateOne(
          { restaurantId, _id: apiKeyObjectId },
          { $set: { revokedAt: new Date() } },
        ).exec();
        await recordAudit({
          restaurantId,
          userId: session.user.id,
          userEmail: session.user.email,
          role,
          action: 'api_key.revoked',
          resourceType: 'api_key',
          resourceId: keyId,
        });
        revalidatePath('/admin/api-keys');
        return { ok: true };
      },
    );
  } catch (error) {
    return actionError(error, 'Failed to revoke API key.', PERMISSION_ERROR);
  }
}
