/**
 * Extracts a single field's value from YAML frontmatter (`---\nkey: value\n---`) or a TOML
 * `key = "value"` / `key = '''value'''` assignment. Deliberately minimal — we only ever need a
 * one-line `name`/`description` value, not full YAML/TOML parsing.
 */
export function extractField(
  content: string,
  field: string,
): string | undefined {
  const yamlMatch = content.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  if (yamlMatch) return yamlMatch[1].trim().replace(/^["']|["']$/g, '');

  const tomlLiteral = content.match(
    new RegExp(`^${field}\\s*=\\s*'''([\\s\\S]*?)'''`, 'm'),
  );
  if (tomlLiteral) return tomlLiteral[1].trim().split('\n')[0];

  const tomlQuoted = content.match(new RegExp(`^${field}\\s*=\\s*"(.*)"`, 'm'));
  if (tomlQuoted) return tomlQuoted[1].trim();

  return undefined;
}
