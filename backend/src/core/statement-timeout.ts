/** SET LOCAL only takes effect inside a transaction (including transaction poolers). */
export async function withStatementTimeout<T>(
  pool: { connect(): Promise<any> },
  timeoutMs: number,
  operation: (client: any) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let releaseError: Error | undefined;
  try {
    await client.query('BEGIN');
    const ms = Math.max(500, Math.floor(timeoutMs));
    await client.query(`SET LOCAL statement_timeout = ${ms}`);
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch (rollbackError) { releaseError = rollbackError as Error; }
    throw error;
  } finally {
    client.release(releaseError);
  }
}
