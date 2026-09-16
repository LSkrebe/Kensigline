/** A receipt identifier is not proof of account ownership. */
export function membershipBelongsToUser(
  membership: { metadata?: Record<string, unknown> | null; user?: { email?: string | null } | null },
  user: { sub: string; email: string | null },
) {
  const linked = membership.metadata?.supabase_user_id;
  if (typeof linked === 'string' && linked.trim()) return linked === user.sub;
  const email = String(membership.user?.email ?? '').trim().toLowerCase();
  return Boolean(email && user.email && email === user.email.trim().toLowerCase());
}
