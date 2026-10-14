import { WorkspaceSidebar } from '@/components/workspace-sidebar';
export default async function Sidebar({ params }: { params: Promise<{ segments: string[] }> }) {
  return <WorkspaceSidebar segments={(await params).segments} />;
}
