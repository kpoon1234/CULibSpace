/**
 * Small builders that keep the OpenAPI path files short and consistent.
 * Documentation only — nothing here is used by request handling.
 */

export type JsonObject = Record<string, unknown>;

export const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/** Security requirement: JWT in `Authorization: Bearer <token>`. */
export const bearer = [{ bearerAuth: [] }];
/** Security requirement: Passport session cookie (`connect.sid`). */
export const cookie = [{ cookieAuth: [] }];
/** Explicitly public (overrides nothing — there is no global security). */
export const publicAccess: never[] = [];

/** `{ success: true, data: <schema> }` envelope used by most endpoints. */
export function dataEnvelope(data: JsonObject, extra: JsonObject = {}): JsonObject {
  return {
    type: 'object',
    required: ['success', 'data'],
    properties: {
      success: { type: 'boolean', example: true },
      ...extra,
      data,
    },
  };
}

/** JSON success response with schema + example. */
export function json(description: string, schema: JsonObject, example?: unknown): JsonObject {
  return {
    description,
    content: {
      'application/json': {
        schema,
        ...(example !== undefined ? { example } : {}),
      },
    },
  };
}

/** Error response with the shared `ErrorResponse` schema and a concrete example. */
export function error(description: string, example: JsonObject): JsonObject {
  return json(description, ref('ErrorResponse'), { success: false, ...example });
}

/** JSON request body. */
export function body(schema: JsonObject, example: unknown, required = true): JsonObject {
  return {
    required,
    content: { 'application/json': { schema, example } },
  };
}

export function pathParam(name: string, description: string, example: number): JsonObject {
  return {
    name,
    in: 'path',
    required: true,
    description,
    schema: { type: 'integer', minimum: 1, maximum: 2147483647 },
    example,
  };
}

export function queryParam(
  name: string,
  description: string,
  schema: JsonObject,
  example?: unknown
): JsonObject {
  return {
    name,
    in: 'query',
    required: false,
    description,
    schema,
    ...(example !== undefined ? { example } : {}),
  };
}

/** Shorthand for the reusable responses defined in components.responses. */
export const R = {
  unauthorized: { $ref: '#/components/responses/Unauthorized' },
  forbiddenRole: { $ref: '#/components/responses/ForbiddenRole' },
  internal: { $ref: '#/components/responses/InternalError' },
};
