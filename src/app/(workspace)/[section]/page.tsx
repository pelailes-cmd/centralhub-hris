import { Administration } from "@/components/administration";
import { Announcements } from "@/components/announcements";
import { Approvals } from "@/components/approvals";
import { Attendance } from "@/components/attendance";
import { Documents } from "@/components/documents";
import { Leave } from "@/components/leave";
import { Payroll } from "@/components/payroll";
import { Performance } from "@/components/performance";
import { Settings } from "@/components/profile";
import { Recruitment } from "@/components/recruitment";
import { getViewer } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { notFound } from "next/navigation";
const pages: Record<string, React.ComponentType> = {
  attendance: Attendance,
  leave: Leave,
  payroll: Payroll,
  documents: Documents,
  performance: Performance,
  announcements: Announcements,
  administration: Administration,
  approvals: Approvals,
  settings: Settings,
  recruitment: Recruitment,
};
export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const titles: Record<string, string> = {
    recruitment: "Recruitment",
    attendance: "Attendance",
    leave: "Time off",
    payroll: "Payroll",
    documents: "Documents",
    performance: "Performance & growth",
    announcements: "Announcements",
    administration: "Administration",
    approvals: "Requests & approvals",
    settings: "My profile",
  };
  return { title: titles[section] || "Workspace" };
}
export default async function Section({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const Page = pages[section];
  if (!Page) notFound();
  const viewer = await getViewer();
  if (section === "recruitment" && !can(viewer, "recruitment.manage")) notFound();
  if (
    section === "administration" &&
    ![
      "organization.manage",
      "accounts.manage",
      "access.manage",
      "technical.manage",
      "audit.read",
    ].some((p) => can(viewer, p))
  )
    notFound();
  return <Page />;
}
