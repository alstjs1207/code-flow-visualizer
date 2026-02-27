import { redirect } from "next/navigation";
import { getAccessToken } from "@/lib/auth";
import { RepoVisualizerPage } from "@/components/repo/RepoVisualizerPage";

interface RepoPageProps {
  params: Promise<{ owner: string; repo: string }>;
}

export default async function RepoPage({ params }: RepoPageProps) {
  const token = await getAccessToken();

  if (!token) {
    redirect("/");
  }

  const { owner, repo } = await params;

  return <RepoVisualizerPage owner={owner} repo={repo} />;
}
