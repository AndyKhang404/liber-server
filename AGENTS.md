Do not commit any changes unless explicitly requested

## Testing Instructions
- Always run `npm run test:e2e:lite` (or `npm run e2e:lite`) for fast in-memory E2E tests during regular iteration.
- Only run `npm run test:e2e` (the heavy Testcontainers suite) when specifically requested by the user or when verifying containerized infrastructure.
- Never duplicate test files between test environments. Keep test assertions unified in `test/*.e2e-spec.ts` and use `createE2eContext()` to handle environment differences.

## Input Validation & DTO Standards
- All DTOs must be declared using **Zod** schemas under `src/<domain>/dto/`.
- TypeScript types must be inferred from the schemas using `z.infer<typeof schema>`.
- Use `ZodValidationPipe` at controller boundaries to parse and validate request bodies and parameters.