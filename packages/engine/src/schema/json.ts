import { z } from 'zod';

/** Any JSON value. Used for fact values, `setValue` payloads and emitted event data. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export const Json = z.json() as z.ZodType<Json>;
