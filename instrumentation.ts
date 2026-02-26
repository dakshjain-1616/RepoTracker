/**
 * Next.js instrumentation hook.
 * Delegates all scheduler work to instrumentation.node.ts which is only
 * imported in the Node.js runtime — keeping lib/db.ts and its Node.js
 * dependencies (path, @libsql/client) out of the Edge runtime bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./instrumentation.node')
    await startScheduler()
  }
}
