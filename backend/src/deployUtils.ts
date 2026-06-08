/** Утилиты для работы с ответами MCP и извлечения unsigned-деплоя. */

/** Возвращает текст до первого JSON-объекта (человекочитаемое summary без деплоя). */
export function summaryBeforeJson(text: string): string {
  const i = text.indexOf("{");
  return (i >= 0 ? text.slice(0, i) : text).trim();
}

/**
 * Ищет в inputSchema тула свойство, в которое надо подставить публичный ключ
 * кошелька (sender_public_key / account_public_key / public_key и т.п.).
 */
export function findPubkeyParam(inputSchema: unknown): string | null {
  const props =
    inputSchema && typeof inputSchema === "object"
      ? (inputSchema as any).properties
      : null;
  if (!props || typeof props !== "object") return null;
  const keys = Object.keys(props);
  return (
    keys.find((k) => /public_key$/i.test(k)) ??
    keys.find((k) => /^(sender|account|owner|address)$/i.test(k)) ??
    null
  );
}

/** Склеивает текстовые блоки из результата вызова MCP-тула в одну строку. */
export function mcpText(content: unknown): string {
  if (!Array.isArray(content)) return typeof content === "string" ? content : "";
  return content
    .map((c) => (c && typeof c === "object" && "text" in c ? String((c as any).text ?? "") : ""))
    .join("\n");
}

/**
 * Достаёт первый сбалансированный JSON-объект из текста (build_swap отдаёт
 * deploy JSON вперемешку с human-readable описанием). Возвращает объект,
 * у которого есть поле `hash` или `header` (признак Casper-деплоя), иначе null.
 */
export function extractDeployJson(text: string): Record<string, unknown> | null {
  let start = -1;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          const obj = JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
          if ("hash" in obj || "header" in obj || "deploy" in obj) {
            return ("deploy" in obj ? (obj.deploy as Record<string, unknown>) : obj);
          }
        } catch {
          /* пробуем следующий объект */
        }
        start = -1;
      }
    }
  }
  return null;
}
