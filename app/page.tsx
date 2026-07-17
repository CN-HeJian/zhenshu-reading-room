import { getDashboardData } from "@/lib/dashboard";
import ReadingRoom from "./reading-room";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <ReadingRoom initialData={await getDashboardData()} />;
}
