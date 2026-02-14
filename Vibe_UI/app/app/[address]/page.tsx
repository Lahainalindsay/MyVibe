import Dashboard from "../../../components/Dashboard";
import { CinematicShell } from "../../../components/CinematicShell";

export default function AddressDashboardPage({ params }: { params: { address: string } }) {
  return (
    <CinematicShell>
      <Dashboard routeAddress={params.address} />
    </CinematicShell>
  );
}
