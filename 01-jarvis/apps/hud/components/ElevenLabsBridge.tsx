"use client";
import { useEffect, useMemo } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { onHudEvent } from "@/lib/events/store";
import { createClientTools } from "@/lib/voice/elevenlabs/tools";
import type { ElevenLabsVoiceSession } from "@/lib/voice/ElevenLabsVoiceSession";

// Must match the API host of the session route: unset (global) or "eu-residency" for an EU workspace.
type ServerLocation = "us" | "global" | "eu-residency" | "in-residency";
const SERVER_LOCATION = (process.env.NEXT_PUBLIC_ELEVENLABS_SERVER_LOCATION || undefined) as ServerLocation | undefined;

/** Mounts the ElevenLabs SDK and connects it to the HUD's VoiceSession. Renders nothing. */
export function ElevenLabsBridge({ session }: { session: ElevenLabsVoiceSession }) {
  return (
    <ConversationProvider>
      <Bridge session={session} />
    </ConversationProvider>
  );
}

function Bridge({ session }: { session: ElevenLabsVoiceSession }) {
  const clientTools = useMemo(() => createClientTools(), []);
  const conversation = useConversation({
    serverLocation: SERVER_LOCATION,
    clientTools,
    onStatusChange: ({ status }) => session.onStatus(status),
    onModeChange: ({ mode }) => session.onMode(mode),
    onMessage: (m) => session.onMessage(m),
    onError: (message) => session.onError(message),
    onVadScore: ({ vadScore }) => session.onVadScore(vadScore),
  });

  useEffect(() => {
    session.attach(conversation);
    return () => session.attach(null);
  }, [session, conversation]);

  useEffect(() => onHudEvent((e) => session.handleHudEvent(e)), [session]);
  // Unmount (hot reload, provider switch) ends the SDK conversation; mirror that.
  useEffect(() => () => session.onStatus("disconnected"), [session]);
  return null;
}

export default ElevenLabsBridge;
