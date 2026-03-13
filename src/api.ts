import { createTRPCProxyClient } from '@trpc/client';
import { ipcLink } from 'electron-trpc/renderer';
import type { AppRouter } from '@api/index';

export const api = createTRPCProxyClient<AppRouter>({
    links: [ipcLink()],
});