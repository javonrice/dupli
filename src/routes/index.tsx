import { createFileRoute } from "@tanstack/react-router";
import { Scanner } from "@/components/scanner";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Dupli — Snap a product, find the dupe" },
      {
        name: "description",
        content: "Point your camera at any beauty product and Dupli finds the affordable dupe in seconds.",
      },
    ],
  }),
});

function Index() {
  // Scanner manages its own iOS-style screens (Home / Scanning / Results).
  return <Scanner />;
}
