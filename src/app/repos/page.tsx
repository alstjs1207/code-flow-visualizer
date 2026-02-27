import { redirect } from "next/navigation";
import { getAccessToken } from "@/lib/auth";
import { RepoListPage } from "@/components/repo/RepoListPage";

export default async function ReposPage() {
  const token = await getAccessToken();

  if (!token) {
    redirect("/");
  }

  return <RepoListPage />;
}
