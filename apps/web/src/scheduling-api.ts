import { z } from 'zod';
import type { Session } from '@servicegrid/contracts';
import { api } from './api';

export async function allScheduling<T>(resource: string, schema: z.ZodType<T>, session: Session) {
  const items: T[] = []; let page = 1; let total = 1;
  while (items.length < total) {
    const result = z.object({ items: z.array(schema), total: z.number() }).parse(await api(`/api/v1/${resource}?page=${page++}&limit=100`, {}, session));
    items.push(...result.items); total = result.total; if (!result.items.length) break;
  }
  return items;
}
export const localDateTime = (instant: string) => { const date = new Date(instant); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
