import { initTRPC } from '@trpc/server'

/**
 * tRPC initialization — shared `t` instance for all routers.
 *
 * Context is intentionally empty for now. When services need to be
 * accessed from routers, context can be extended with ServiceRegistry.
 */
const t = initTRPC.create({ isServer: true })

export const trpcRouter = t.router
export const publicProcedure = t.procedure
export const mergeRouters = t.mergeRouters
