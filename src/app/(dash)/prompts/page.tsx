import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { MODULES } from '@/modules/manifests';
import { Badge, PageHeader } from '@/components/ui';
import { PromptEditor } from '@/components/PromptEditor';

export default async function PromptsPage() {
  const session = await getSession();
  const prompts = await prisma.promptTemplate.findMany({ orderBy: [{ moduleKey: 'asc' }, { stageKey: 'asc' }] });
  const groups = [...new Set(prompts.map((p) => p.moduleKey))];
  return (
    <>
      <PageHeader title="Prompt Manager" description="Placeholders like {{keyword}} are filled per task. Custom prompts are never overwritten by upgrades." />
      {prompts.length === 0 && <p className="card text-sm">No prompts seeded. Run <code>npm run setup</code>.</p>}
      {groups.map((g) => (
        <section key={g} className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">{MODULES.find((m) => m.key === g)?.name ?? g}</h2>
          <div className="space-y-3">
            {prompts.filter((p) => p.moduleKey === g).map((p) => (
              <details key={p.id} className="card">
                <summary className="flex cursor-pointer items-center gap-2 font-medium">{p.name} <span className="text-xs text-slate-500">{p.stageKey}</span> {p.customized ? <Badge tone="warning">custom</Badge> : <Badge>default v{p.defaultVersion}</Badge>}</summary>
                <p className="mt-2 text-xs text-slate-500">{p.description}</p>
                <div className="mt-2"><PromptEditor id={p.id} content={p.content} customized={p.customized} canEdit={session?.role === 'ADMIN'} /></div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
