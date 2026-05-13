import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/staff-management")({
  component: () => <Navigate to="/staff" />,
});
