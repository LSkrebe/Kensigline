/** Share concurrent deliveries; acknowledge only after the handler succeeds. */
export function createWebhookDeliveryProcessor(maxCompleted = 5000) {
  const completed = new Set<string>();
  const pending = new Map<string, Promise<void>>();
  return async (id: string, handler: () => Promise<void>): Promise<boolean> => {
    if (!id) { await handler(); return false; }
    if (completed.has(id)) return true;
    const inFlight = pending.get(id);
    if (inFlight) { await inFlight; return true; }
    const work = Promise.resolve().then(handler);
    pending.set(id, work);
    try {
      await work;
      completed.add(id);
      if (completed.size > maxCompleted) completed.delete(completed.values().next().value!);
      return false;
    } finally {
      pending.delete(id);
    }
  };
}
