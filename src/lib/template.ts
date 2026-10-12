/**
 * Minimal deterministic prompt template engine.
 * Supports {{var}}, {{#if var}}...{{/if}}, {{#unless var}}...{{/unless}} (nestable).
 * Unresolved required placeholders raise TemplateError so they never reach ChatGPT.
 */
export class TemplateError extends Error {
  constructor(message: string, public readonly missing: string[] = []) {
    super(message);
    this.name = 'TemplateError';
  }
}

export type TemplateVars = Record<string, unknown>;

const VAR_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function isTruthy(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return !Number.isNaN(value);
  return Boolean(value);
}

function stringify(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

type Node =
  | { type: 'text'; value: string }
  | { type: 'var'; name: string }
  | { type: 'block'; kind: 'if' | 'unless'; name: string; children: Node[] };

function parse(template: string): Node[] {
  const root: Node[] = [];
  const stack: { kind: 'if' | 'unless'; name: string; children: Node[] }[] = [];
  const re = /\{\{\s*(#if|#unless|\/if|\/unless)?\s*([a-zA-Z_][a-zA-Z0-9_]*)?\s*\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const current = () => (stack.length ? stack[stack.length - 1].children : root);
  while ((m = re.exec(template))) {
    if (m.index > last) current().push({ type: 'text', value: template.slice(last, m.index) });
    last = re.lastIndex;
    const [, directive, name] = m;
    if (directive === '#if' || directive === '#unless') {
      if (!name) throw new TemplateError(`Block ${directive} requires a variable name`);
      stack.push({ kind: directive === '#if' ? 'if' : 'unless', name, children: [] });
    } else if (directive === '/if' || directive === '/unless') {
      const top = stack.pop();
      if (!top || `/${top.kind}` !== directive) throw new TemplateError(`Unbalanced ${directive}`);
      current().push({ type: 'block', kind: top.kind, name: top.name, children: top.children });
    } else if (name) {
      current().push({ type: 'var', name });
    }
  }
  if (stack.length) throw new TemplateError(`Unclosed {{#${stack[stack.length - 1].kind} ${stack[stack.length - 1].name}}}`);
  if (last < template.length) root.push({ type: 'text', value: template.slice(last) });
  return root;
}

function renderNodes(nodes: Node[], vars: TemplateVars, missing: Set<string>): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') out += node.value;
    else if (node.type === 'var') {
      const value = vars[node.name];
      if (value == null || (typeof value === 'string' && value === '')) {
        missing.add(node.name);
      } else out += stringify(value);
    } else {
      const truthy = isTruthy(vars[node.name]);
      if ((node.kind === 'if' && truthy) || (node.kind === 'unless' && !truthy)) {
        out += renderNodes(node.children, vars, missing);
      }
    }
  }
  return out;
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  const missing = new Set<string>();
  const out = renderNodes(parse(template), vars, missing);
  if (missing.size) {
    throw new TemplateError(`Unresolved prompt variables: ${[...missing].join(', ')}`, [...missing]);
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export function listTemplateVariables(template: string): string[] {
  const names = new Set<string>();
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.type === 'var') names.add(n.name);
      if (n.type === 'block') {
        names.add(n.name);
        walk(n.children);
      }
    }
  };
  walk(parse(template));
  return [...names].filter((n) => VAR_NAME.test(n));
}

export function validateTemplate(template: string): { ok: true; variables: string[] } | { ok: false; error: string } {
  try {
    return { ok: true, variables: listTemplateVariables(template) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
