import { createFileRoute } from "@tanstack/react-router";
import GameShell from "@/components/GameShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nigga Fighters — 2D Action Fighting Game" },
      {
        name: "description",
        content:
          "Play Nigga Fighters, a browser 2D action brawler: handgun, punches, kicks and knee strikes across five levels ending in a boss fight.",
      },
      { property: "og:title", content: "Nigga Fighters — 2D Action Fighting Game" },
      {
        property: "og:description",
        content:
          "A polished HTML5 canvas brawler with melee combos, shooting, enemy AI and five levels of escalating difficulty.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <GameShell />;
}
