import { prisma } from '@/lib/db';
import { MODULES } from '@/modules/manifests';
import { PageHeader } from '@/components/ui';
import { TaskForm } from '@/components/TaskForm';

export default async function NewTaskPage() {
  const sites = await prisma.website.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, language: true, targetCountry: true, defaultWriter: true, categories: { select: { id: true, name: true }, orderBy: { name: 'asc' } } } });
  return (
    <>
      <PageHeader title="New article" description="Tasks run through ChatGPT in your Automation Chrome window and end as WordPress drafts (never published)." />
      <TaskForm sites={sites} modules={MODULES.map(({ key, name, description, available }) => ({ key, name, description, available }))} />
    </>
  );
}
