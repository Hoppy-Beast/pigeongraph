import Ajv2020Module from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import superNodeSchema from './schema.json' with { type: 'json' };
import type { SuperNode } from './types.js';

// Setup Ajv instance for Draft 2020-12
const Ajv2020 = (Ajv2020Module as unknown as { default?: typeof Ajv2020Module }).default ?? Ajv2020Module;
// @ts-expect-error type instantiation
const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: true,
});

const addFormats = (addFormatsModule as unknown as { default?: typeof addFormatsModule }).default ?? addFormatsModule;
// @ts-expect-error addFormats type compatibility
addFormats(ajv);

const validateSuperNodeFn = ajv.compile<SuperNode>(superNodeSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a SuperNode instance against the formal Draft 2020-12 JSON Schema.
 */
export function validateSuperNode(node: unknown): ValidationResult {
  const valid = validateSuperNodeFn(node);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validateSuperNodeFn.errors ?? []).map((err: { instancePath?: string; message?: string }) => {
    return `${err.instancePath || 'root'} ${err.message ?? 'validation error'}`;
  });
  return { valid: false, errors };
}

export { superNodeSchema };
