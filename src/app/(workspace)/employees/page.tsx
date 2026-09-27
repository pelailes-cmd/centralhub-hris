import { People } from "@/components/people";
import { getViewer } from "@/lib/auth";

export const metadata = { title: "People" };

export default async function EmployeesPage() {
  await getViewer();
  return <People />;
}
