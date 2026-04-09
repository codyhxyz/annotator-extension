/** Build a SQL WHERE clause fragment that filters annotations by privacy level. */
export function buildPrivacyFilter(requesterId: string, friendIds: string[]): string {
  if (friendIds.length === 0) {
    return `(user_id = ?1 OR privacy = 'open') AND deleted_at IS NULL`;
  }

  // Use parameter placeholders for safety — caller must bind them
  // This returns a fragment designed to be used with manually bound params
  const friendPlaceholders = friendIds.map((_, i) => `?${i + 2}`).join(',');
  return `(
    user_id = ?1
    OR (privacy = 'friends' AND user_id IN (${friendPlaceholders}))
    OR privacy = 'open'
  ) AND deleted_at IS NULL`;
}

/** Get friend IDs for a user, with KV caching. */
export async function getFriendIds(
  db: D1Database,
  kv: KVNamespace,
  userId: string,
): Promise<string[]> {
  const cacheKey = `friends:${userId}`;
  const cached = await kv.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const result = await db.prepare(`
    SELECT CASE
      WHEN requester_id = ? THEN addressee_id
      ELSE requester_id
    END as friend_id
    FROM friendships
    WHERE status = 'accepted'
      AND (requester_id = ? OR addressee_id = ?)
  `).bind(userId, userId, userId).all<{ friend_id: string }>();

  const friendIds = result.results.map(r => r.friend_id);
  await kv.put(cacheKey, JSON.stringify(friendIds), { expirationTtl: 300 }); // 5 min cache
  return friendIds;
}

/** Invalidate friend cache for both users in a friendship change. */
export async function invalidateFriendCache(kv: KVNamespace, ...userIds: string[]) {
  await Promise.all(userIds.map(id => kv.delete(`friends:${id}`)));
}
