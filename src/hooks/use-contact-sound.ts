"use client";

import { useEffect, useRef } from "react";
import { contactCollection } from "@/collections";

/**
 * Hook that plays a sound when a new contact is synced from a remote source.
 * Only plays for contacts synced from other devices/browsers, not for local mutations.
 * Uses TanStack DB's subscribeChanges to distinguish between optimistic and synced updates.
 */
export function useContactSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isInitialLoadRef = useRef(true);
  const localMutationIdsRef = useRef<Set<string>>(new Set());
  const audioUnlockedRef = useRef(false);

  // Initialize audio element on mount
  useEffect(() => {
    audioRef.current = new Audio("/new-message.mp3");
    audioRef.current.volume = 0.5; // Set volume to 50%

    // iOS requires user interaction to unlock audio playback
    // This handler unlocks the audio on first user interaction
    const unlockAudio = () => {
      if (audioUnlockedRef.current || !audioRef.current) return;

      // Play and immediately pause to unlock audio on iOS
      audioRef.current.play().then(() => {
        audioRef.current?.pause();
        audioRef.current!.currentTime = 0;
        audioUnlockedRef.current = true;
      }).catch(() => {
        // Ignore errors - will retry on next interaction
      });
    };

    // Listen for user interactions to unlock audio
    document.addEventListener("touchstart", unlockAudio, { once: true });
    document.addEventListener("click", unlockAudio, { once: true });

    return () => {
      document.removeEventListener("touchstart", unlockAudio);
      document.removeEventListener("click", unlockAudio);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Subscribe to collection changes to detect synced updates
  useEffect(() => {
    // Subscribe to changes in the collection
    const unsubscribe = contactCollection.subscribeChanges((changes) => {
      // Skip initial state changes (when component first mounts)
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
        return;
      }

      // Check for insert changes that aren't from local optimistic mutations
      for (const change of changes) {
        if (change.type === "insert") {
          const contactId = String(change.key);

          // If this ID was created locally, skip sound
          // Don't delete from set - ElectricSQL may fire multiple events for the same insert
          // (optimistic + sync confirmation). Let the 30-second timeout handle cleanup.
          if (localMutationIdsRef.current.has(contactId)) {
            continue;
          }

          // This is a synced insert from another device/browser - play sound!
          audioRef.current?.play().catch((error) => {
            console.error("Failed to play notification sound:", error);
          });
        }
      }
    });

    return unsubscribe;
  }, []);

  // Track local mutations by intercepting collection insert calls
  useEffect(() => {
    const originalInsert = contactCollection.insert.bind(contactCollection);

    // Wrap the insert method to track local mutations
    contactCollection.insert = function (item: any, options?: any) {
      // Track this ID as a local mutation
      if (item.id) {
        localMutationIdsRef.current.add(item.id);

        // Clean up after 30 seconds in case the sync never arrives
        setTimeout(() => {
          localMutationIdsRef.current.delete(item.id);
        }, 30000);
      }

      // Call original insert
      return originalInsert(item, options);
    };

    return () => {
      // Restore original insert method on cleanup
      contactCollection.insert = originalInsert;
    };
  }, []);
}
