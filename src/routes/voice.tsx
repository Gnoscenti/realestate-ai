import { createFileRoute } from "@tanstack/react-router";
import { VoiceConsole } from "@/components/voice/voice-console";

export const Route = createFileRoute("/voice")({
  component: VoiceConsole,
});
