/**
 * Helpers for working with n8n credential JSON schemas.
 *
 * n8n uses a mix of root properties and allOf/oneOf/anyOf branches. The public
 * API is strict about allowed keys, while `required` arrays are often empty and
 * n8n still expects every declared property to be present. These helpers
 * collect the schema, fill safe defaults, and report genuinely required values
 * that must be supplied by the caller.
 */

function collectSchemas(schema, out = []) {
  if (!schema) return out;
  out.push(schema);
  for (const key of ['allOf', 'oneOf', 'anyOf']) {
    if (Array.isArray(schema[key])) {
      for (const sub of schema[key]) collectSchemas(sub, out);
    }
  }
  return out;
}

function collectRequiredKeys(schema) {
  const required = new Set();
  if (!schema) return required;

  // oneOf/anyOf branches are alternatives; requiring the union of all their
  // fields would reject valid credentials.
  const addFrom = (node) => {
    if (!node) return;
    for (const key of node.required || []) required.add(key);
    for (const sub of node.allOf || []) addFrom(sub);
  };
  addFrom(schema);
  return required;
}

function collectProperties(schema) {
  const properties = new Map();
  for (const sub of collectSchemas(schema)) {
    for (const [key, prop] of Object.entries(sub.properties || {})) {
      if (prop.type === 'notice') continue;
      if (!properties.has(key)) properties.set(key, prop);
    }
  }
  return properties;
}

function defaultValueFor(prop) {
  if (prop.default !== undefined) return prop.default;
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return prop.enum[0];
  const type = Array.isArray(prop.type) ? prop.type.find((t) => t !== 'null') : prop.type;
  if (type === 'boolean') return false;
  if (type === 'number' || type === 'integer') return 0;
  if (type === 'object') return {};
  if (type === 'array') return [];
  return '';
}

/**
 * Merge explicit values with schema defaults and report missing required
 * fields. Explicit values always win.
 *
 * Returns:
 *   data            — the data to send to n8n
 *   allowedKeys     — keys accepted by the schema
 *   missingRequired — required keys that have no explicit value or default
 *   unknownKeys     — supplied keys that the schema does not allow
 */
function applySchemaDefaults(schema, input) {
  const properties = collectProperties(schema);
  const required = collectRequiredKeys(schema);
  const data = { ...input };
  const missingRequired = [];

  for (const [key, prop] of properties) {
    if (data[key] !== undefined) continue;
    if (prop.default !== undefined) {
      data[key] = prop.default;
    } else if (required.has(key)) {
      missingRequired.push(key);
    } else {
      data[key] = defaultValueFor(prop);
    }
  }

  const allowedKeys = [...properties.keys()];
  const allSchemas = collectSchemas(schema);
  const allowsAdditional = allSchemas.some((s) => s.additionalProperties !== false);
  const unknownKeys = Object.keys(data).filter((key) => !properties.has(key));
  if (!allowsAdditional) {
    for (const key of unknownKeys) delete data[key];
  }

  return {
    data,
    allowedKeys,
    missingRequired,
    unknownKeys,
  };
}

module.exports = {
  collectSchemas,
  collectRequiredKeys,
  collectProperties,
  applySchemaDefaults,
  defaultValueFor,
};
