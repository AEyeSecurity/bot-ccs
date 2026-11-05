// Compartido entre los bundles de rutas de Next dentro de la única réplica web.
const shared = globalThis as typeof globalThis & { botCcsContactQueues?: Map<string, Promise<void>> };
const contactQueues = shared.botCcsContactQueues ??= new Map<string, Promise<void>>();

export function withContactLock<T>(phone: string, operation: () => Promise<T>) {
  phone = String(phone || "").replace(/\D/g, "");
  const previous = contactQueues.get(phone) || Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const completion = result.then(
    () => undefined,
    () => undefined,
  );

  contactQueues.set(phone, completion);
  void completion.finally(() => {
    if (contactQueues.get(phone) === completion) contactQueues.delete(phone);
  });

  return result;
}

