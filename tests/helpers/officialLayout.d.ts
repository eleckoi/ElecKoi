import type { ComponentType } from 'react';
export function loadOfficialLayout(globals?: Record<string, unknown>): { apply(ctx: any): void; inject: string[]; LayoutController: typeof import('@deepseek-ai/dsh-client-ui-layout/client').LayoutController };
export function officialLayoutFixture(globals?: Record<string, unknown>): { Frame: ComponentType<any>; store: any; dispose(): void };
