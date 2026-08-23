/**
 * OpenAPI 3.1 description of the Flaghoist HTTP API. It is served at `GET /api/v1/openapi.json`
 * and exported for tooling (`import { openApiDocument } from '@flaghoist/server'`).
 *
 * The admin API (`/api/v1/flags`) is Flaghoist's own, versioned surface for building dashboards
 * and integrations. The read API (`/ofrep/v1/...`) follows the OpenFeature Remote Evaluation
 * Protocol and is described here for completeness.
 */
export const openApiDocument: Record<string, unknown> = {
  openapi: '3.1.0',
  info: {
    title: 'Flaghoist API',
    version: '0.1.0',
    description:
      "Manage and evaluate feature flags. The admin API (`/api/v1/flags`) is Flaghoist's own; the read API (`/ofrep/v1`) follows the OpenFeature Remote Evaluation Protocol (OFREP). The unversioned `/flags` paths remain as a legacy alias of `/api/v1/flags`.",
    license: { name: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
  },
  servers: [{ url: '/', description: 'This Flaghoist server' }],
  tags: [
    { name: 'admin', description: 'Manage flag definitions (admin auth).' },
    {
      name: 'evaluate',
      description: 'Evaluate flags for a context (OFREP read path, API-key auth).',
    },
    { name: 'meta', description: 'Health and discovery.' },
  ],
  paths: {
    '/api/v1/flags': {
      get: {
        tags: ['admin'],
        summary: 'List all flags',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'All flags',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['flags'],
                  properties: {
                    flags: { type: 'array', items: { $ref: '#/components/schemas/FeatureFlag' } },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/v1/flags/{key}': {
      parameters: [{ $ref: '#/components/parameters/FlagKey' }],
      get: {
        tags: ['admin'],
        summary: 'Get one flag',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'The flag',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/FeatureFlag' } },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      put: {
        tags: ['admin'],
        summary: 'Create or replace a flag',
        description:
          'A full replace. Creation metadata (createdBy/createdAt) is preserved; the updater and updatedAt are stamped server-side. Invalid targeting rules are rejected with 400.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/FlagInput' } } },
        },
        responses: {
          '200': {
            description: 'The stored flag',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/FeatureFlag' } },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '413': { description: 'Payload too large' },
        },
      },
      delete: {
        tags: ['admin'],
        summary: 'Delete a flag',
        security: [{ bearerAuth: [] }],
        responses: {
          '204': { description: 'Deleted (idempotent)' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/ofrep/v1/evaluate/flags': {
      post: {
        tags: ['evaluate'],
        summary: 'Evaluate all flags for a context (OFREP bulk)',
        security: [{ apiKeyAuth: [] }],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/EvaluationRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Evaluated flags',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    flags: { type: 'array', items: { $ref: '#/components/schemas/EvaluatedFlag' } },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/ofrep/v1/evaluate/flags/{key}': {
      parameters: [{ $ref: '#/components/parameters/FlagKey' }],
      post: {
        tags: ['evaluate'],
        summary: 'Evaluate one flag (OFREP)',
        security: [{ apiKeyAuth: [] }],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/EvaluationRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Evaluated flag',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/EvaluatedFlag' } },
            },
          },
          '404': { description: 'Unknown flag (errorCode FLAG_NOT_FOUND)' },
        },
      },
    },
    '/api/v1/openapi.json': {
      get: {
        tags: ['meta'],
        summary: 'This OpenAPI document',
        responses: { '200': { description: 'The OpenAPI document' } },
      },
    },
    '/health': {
      get: {
        tags: ['meta'],
        summary: 'Health check',
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { status: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Admin token (or a validated OIDC JWT).',
      },
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'Read-only API key.',
      },
    },
    parameters: {
      FlagKey: {
        name: 'key',
        in: 'path',
        required: true,
        description: 'Flag key.',
        schema: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$', maxLength: 256 },
      },
    },
    responses: {
      Unauthorized: {
        description: 'Missing or invalid credentials',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      BadRequest: {
        description: 'Invalid request or flag definition',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Flag not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
    schemas: {
      Error: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } },
      Condition: {
        type: 'object',
        required: ['attribute', 'operator', 'value'],
        properties: {
          attribute: { type: 'string', maxLength: 256 },
          operator: {
            type: 'string',
            enum: [
              'eq',
              'neq',
              'in',
              'notIn',
              'contains',
              'startsWith',
              'endsWith',
              'gt',
              'gte',
              'lt',
              'lte',
              'semverGte',
              'semverLt',
            ],
          },
          value: {
            description: 'A scalar, or an array of scalars for `in` / `notIn`.',
            oneOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
              { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'number' }] } },
            ],
          },
        },
      },
      RuleResult: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: { type: 'boolean' },
          rollout: {
            type: 'object',
            properties: { percentage: { type: 'number', minimum: 0, maximum: 100 } },
          },
        },
      },
      TargetingRule: {
        type: 'object',
        required: ['conditions', 'result'],
        properties: {
          description: { type: 'string' },
          conditions: { type: 'array', items: { $ref: '#/components/schemas/Condition' } },
          result: { $ref: '#/components/schemas/RuleResult' },
        },
      },
      FlagMetadata: {
        type: 'object',
        properties: {
          createdBy: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedBy: { type: 'string' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      FlagInput: {
        type: 'object',
        required: ['enabled', 'rollout'],
        properties: {
          enabled: { type: 'boolean' },
          rollout: {
            type: 'object',
            required: ['percentage'],
            properties: { percentage: { type: 'number', minimum: 0, maximum: 100 } },
          },
          rules: { type: 'array', items: { $ref: '#/components/schemas/TargetingRule' } },
          description: { type: 'string' },
        },
      },
      FeatureFlag: {
        allOf: [
          { $ref: '#/components/schemas/FlagInput' },
          {
            type: 'object',
            required: ['key', 'metadata'],
            properties: {
              key: { type: 'string' },
              metadata: { $ref: '#/components/schemas/FlagMetadata' },
            },
          },
        ],
      },
      EvaluationRequest: {
        type: 'object',
        properties: {
          context: {
            type: 'object',
            description: 'OpenFeature evaluation context.',
            properties: { targetingKey: { type: 'string' } },
            additionalProperties: true,
          },
        },
      },
      EvaluatedFlag: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          value: { type: 'boolean' },
          reason: {
            type: 'string',
            enum: ['STATIC', 'TARGETING_MATCH', 'SPLIT', 'DEFAULT'],
          },
          variant: { type: 'string' },
        },
      },
    },
  },
}
