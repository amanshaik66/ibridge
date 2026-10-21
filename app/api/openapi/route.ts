import { json, DEMO_KEY } from "@/lib/auth";

export async function GET() {
  return json({
    openapi: "3.1.0",
    info: {
      title: "iBridge API",
      version: "1.0.0",
      description:
        "Customer + order API in the spirit of an IBM i integration bridge. " +
        "Auth: send your API key in the x-api-key header. Rate limit: 60 req/min per key. " +
        "Note: the backing store is in-memory and resets on cold starts; treat it as a sandbox.",
    },
    servers: [{ url: "https://ibridge-mauve.vercel.app" }],
    components: {
      securitySchemes: {
        apiKey: { type: "apiKey", in: "header", name: "x-api-key" },
      },
      schemas: {
        Customer: {
          type: "object",
          properties: {
            id: { type: "string", example: "CUS-1001" },
            name: { type: "string", example: "Priya Nair" },
            email: { type: "string", example: "priya@acmecorp.com" },
            company: { type: "string", example: "Acme Corp" },
            status: { type: "string", enum: ["active", "inactive", "prospect"] },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Order: {
          type: "object",
          properties: {
            id: { type: "string", example: "ORD-1001" },
            customerId: { type: "string" },
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  sku: { type: "string" },
                  description: { type: "string" },
                  qty: { type: "number" },
                  unitPrice: { type: "number" },
                },
              },
            },
            subtotal: { type: "number" },
            tax: { type: "number" },
            total: { type: "number" },
            currency: { type: "string", example: "USD" },
            status: { type: "string", enum: ["draft", "confirmed", "shipped", "cancelled"] },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Error: {
          type: "object",
          properties: { error: { type: "string" }, message: { type: "string" } },
        },
      },
    },
    security: [{ apiKey: [] }],
    paths: {
      "/api/health": {
        get: { summary: "Service health (no auth)", security: [], responses: { "200": { description: "ok" } } },
      },
      "/api/customers": {
        get: { summary: "List customers", responses: { "200": { description: "customer list" } } },
        post: {
          summary: "Create customer",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", required: ["name", "email"], properties: {
                  name: { type: "string" }, email: { type: "string" },
                  company: { type: "string" }, status: { type: "string" } } },
              },
            },
          },
          responses: { "201": { description: "created" }, "422": { description: "validation error" } },
        },
      },
      "/api/customers/{id}": {
        get: { summary: "Get customer", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "ok" }, "404": { description: "not found" } } },
        put: { summary: "Update customer", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "ok" }, "404": { description: "not found" } } },
        delete: { summary: "Delete customer", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "ok" }, "404": { description: "not found" } } },
      },
      "/api/orders": {
        get: { summary: "List orders (filter ?customerId=)", responses: { "200": { description: "order list" } } },
        post: {
          summary: "Create order (totals computed server-side)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", required: ["customerId", "lines"], properties: {
                  customerId: { type: "string" },
                  lines: { type: "array", items: { type: "object" } } } },
              },
            },
          },
          responses: { "201": { description: "created" }, "422": { description: "validation error" } },
        },
      },
    },
    "x-demo": { apiKey: DEMO_KEY, note: "Use this key in x-api-key to try the sandbox." },
  });
}
