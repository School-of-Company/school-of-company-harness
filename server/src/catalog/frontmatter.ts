/**
 * 스킬/에이전트 파일 머리말에서 한 필드 값만 뽑아낸다.
 *
 * 카탈로그 항목은 세 가지 형식이 섞여 있는데, 필요한 건 `description` 한 줄뿐이다:
 * - Claude 스킬/에이전트: YAML frontmatter (`---` 사이의 `description: ...`)
 * - Codex 에이전트: TOML (`description = "..."` 또는 여러 줄 리터럴 문자열 `'''...'''`)
 *
 * 그래서 `js-yaml`/TOML 파서를 의존성으로 추가하는 대신 정규식으로 해당 줄만 긁는다.
 * 파싱 실패나 형식 불일치는 그냥 `undefined`를 반환해서, 설명 없이 제목만 보여주는 쪽으로 흘러간다
 * — 카탈로그 표시용 부가 정보라서 정확한 파싱보다 "죽지 않는 것"이 중요하다.
 *
 * `m` 플래그는 `^`/`$`를 문서 전체가 아니라 각 줄의 시작/끝에 매칭시켜, 파일 중간에 있는
 * `description:` 줄도 찾을 수 있게 해준다.
 */
export function extractField(
  content: string,
  field: string,
): string | undefined {
  // YAML: `description: 값` — 양쪽 따옴표가 있으면 벗겨낸다.
  const yamlMatch = content.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  if (yamlMatch) return yamlMatch[1].trim().replace(/^["']|["']$/g, '');

  // TOML 리터럴 문자열: `description = '''여러 줄...'''` — 첫 줄만 요약으로 쓴다.
  const tomlLiteral = content.match(
    new RegExp(`^${field}\\s*=\\s*'''([\\s\\S]*?)'''`, 'm'),
  );
  if (tomlLiteral) return tomlLiteral[1].trim().split('\n')[0];

  // TOML 기본 문자열: `description = "값"`
  const tomlQuoted = content.match(new RegExp(`^${field}\\s*=\\s*"(.*)"`, 'm'));
  if (tomlQuoted) return tomlQuoted[1].trim();

  return undefined;
}
