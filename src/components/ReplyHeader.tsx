import React, { useState, useEffect } from 'react';
import { getOrCreateMatrixClient } from '../services/matrix';

export interface ReplyHeaderProps {
  eventId: string;
  roomId?: string;
  onReplyClick?: (eventId: string) => void;
  fallbackSnippet?: string;
  fallbackUserName?: string;
}

// Module-level cache so timeline rerenders or component remounts retain resolved reply data instantly
const replyEventCache = new Map<string, { text: string; sender: string }>();

export const ReplyHeader: React.FC<ReplyHeaderProps> = ({
  eventId,
  roomId,
  onReplyClick,
  fallbackSnippet,
  fallbackUserName = 'user',
}) => {
  // Use cached data first, then message.replyTo fallback data, never default to "Loading..." if data is available
  const cached = eventId ? replyEventCache.get(eventId) : undefined;
  const initialText = cached?.text || fallbackSnippet || 'Loading...';
  const initialUser = cached?.sender || fallbackUserName || 'user';

  const [replyText, setReplyText] = useState<string>(initialText);
  const [replyUser, setReplyUser] = useState<string>(initialUser);

  // Keep fallback state in sync if props update
  useEffect(() => {
    if (fallbackSnippet && (replyText === 'Loading...' || replyText === 'Message unavailable')) {
      setReplyText(fallbackSnippet);
    }
    if (fallbackUserName && fallbackUserName !== 'user' && (!replyUser || replyUser === 'user')) {
      setReplyUser(fallbackUserName);
    }
  }, [fallbackSnippet, fallbackUserName, replyText, replyUser]);

  useEffect(() => {
    let isMounted = true;

    async function resolveReply() {
      if (!eventId) {
        if (isMounted && !fallbackSnippet && !cached?.text) {
          setReplyText('Message unavailable');
        }
        return;
      }

      // If we already have it in cache, apply immediately and return without re-fetching
      if (cached) {
        if (isMounted) {
          setReplyText(cached.text);
          if (cached.sender) setReplyUser(cached.sender);
        }
        return;
      }

      // DO NOT clear replyText or replyUser to "Loading..." here!
      // This keeps the existing message.replyTo preview completely stable during async lookup.

      try {
        const client = await getOrCreateMatrixClient();
        if (!client) {
          if (isMounted && !fallbackSnippet) {
            setReplyText('Message unavailable');
          }
          return;
        }

        // Locate room from client
        let room: any = null;
        if (roomId && typeof client.getRoom === 'function') {
          room = client.getRoom(roomId);
        }

        // If room not found directly by roomId, search all rooms
        if (!room && typeof client.getRooms === 'function') {
          const allRooms = client.getRooms();
          room = allRooms.find((r: any) => {
            if (r.roomId === roomId) return true;
            if (r.timeline && Array.isArray(r.timeline)) {
              return r.timeline.some((e: any) => (typeof e?.getId === 'function' ? e.getId() : e?.event_id) === eventId);
            }
            return false;
          }) || null;
        }

        // STEP 1 (Local): Manually search timeline first
        let foundEvent: any = null;
        if (room && room.timeline && Array.isArray(room.timeline)) {
          foundEvent = room.timeline.find((e: any) => (typeof e?.getId === 'function' ? e.getId() : e?.event_id) === eventId);
        }

        // Secondary local search if not found in room.timeline array
        if (!foundEvent && room?.getLiveTimeline) {
          const liveEvents = room.getLiveTimeline().getEvents?.() || [];
          foundEvent = liveEvents.find((e: any) => (typeof e?.getId === 'function' ? e.getId() : e?.event_id) === eventId);
        }
        if (!foundEvent && room && typeof room.findEventById === 'function') {
          foundEvent = room.findEventById(eventId);
        }

        // STEP 2 (Fallback): If !localEvent, await network call
        if (!foundEvent && client) {
          const actualRoomId = room?.roomId || (roomId?.startsWith('!') ? roomId : null);
          if (actualRoomId && typeof client.fetchRoomEvent === 'function') {
            try {
              const fetchedEvent = await client.fetchRoomEvent(actualRoomId, eventId);
              if (fetchedEvent) {
                foundEvent = fetchedEvent;
              }
            } catch (netErr) {
              console.warn('[ReplyHeader] fetchRoomEvent error:', netErr);
            }
          }

          // If still not found, try REST API fallback
          if (!foundEvent && actualRoomId) {
            try {
              const token = localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token');
              const userId = localStorage.getItem('matrix_user_id');
              
              let baseUrl = 'https://matrix.org';
              if (userId && userId.includes(':')) {
                const domain = userId.split(':').pop();
                if (domain) baseUrl = `https://${domain}`;
              }

              const res = await fetch(
                `${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(actualRoomId)}/event/${encodeURIComponent(eventId)}`,
                {
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                }
              );
              if (res && res.ok) {
                foundEvent = await res.json();
              }
            } catch {}
          }
        }

        // STEP 3 (Extract): From whichever event is found, safely extract the body
        if (isMounted) {
          if (foundEvent) {
            if (client && typeof client.decryptEventIfNeeded === 'function') {
              try {
                await client.decryptEventIfNeeded(foundEvent);
              } catch (decErr) {
                console.warn('[ReplyHeader] Decryption error:', decErr);
              }
            }

            const rawBody =
              (typeof foundEvent.getClearContent === 'function' ? foundEvent.getClearContent()?.body : null) ||
              (typeof foundEvent.getContent === 'function' ? foundEvent.getContent()?.body : null) ||
              foundEvent.getClearContent?.()?.body ||
              foundEvent.getContent?.()?.body ||
              foundEvent.content?.body ||
              foundEvent.body;

            const text = rawBody || 'Media message';
            let sName = fallbackUserName || 'user';

            const sender =
              (typeof foundEvent.getSender === 'function' ? foundEvent.getSender() : null) ||
              foundEvent.getSender?.() ||
              foundEvent.sender;

            if (sender) {
              sName = sender.split(':')[0].replace('@', '');
              if (room && typeof room.getMember === 'function') {
                const member = room.getMember(sender);
                if (member && member.name && !member.name.startsWith('@')) {
                  sName = member.name;
                }
              }
              if (sName === sender.split(':')[0].replace('@', '') && client && typeof client.getUser === 'function') {
                const user = client.getUser(sender);
                if (user && user.displayName) {
                  sName = user.displayName;
                }
              }
            }

            // Cache successful resolution so it survives future rerenders
            replyEventCache.set(eventId, { text, sender: sName });
            setReplyText(text);
            setReplyUser(sName);
          } else {
            // Lookup failed to find event: ONLY show "Message unavailable" if we don't have existing fallback
            if (!fallbackSnippet) {
              setReplyText('Message unavailable');
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          if (!fallbackSnippet) {
            setReplyText('Message unavailable');
          }
        }
      }
    }

    resolveReply();

    return () => {
      isMounted = false;
    };
  }, [eventId, roomId, fallbackSnippet, fallbackUserName, cached]);

  // Display computation: ALWAYS use fallbackSnippet / existing data first
  const displayText =
    replyText && replyText !== 'Loading...' && replyText !== 'Message unavailable'
      ? replyText
      : fallbackSnippet || (replyText === 'Loading...' ? 'Loading...' : 'Message unavailable');

  const displayUser =
    replyUser && replyUser !== 'user'
      ? replyUser
      : fallbackUserName || replyUser || 'user';

  return (
    <div className="relative flex items-center gap-2 mb-1 select-none overflow-hidden">
      {/* Curved reply connector: always rendered as long as ReplyHeader exists */}
      <div className="w-6 sm:w-8 h-4 border-l-2 border-t-2 border-[#4e5058] rounded-tl-md mt-2 ml-3 sm:ml-5 mb-1 absolute -left-2 pointer-events-none" />
      <div
        onClick={(e) => {
          e.stopPropagation();
          if (onReplyClick && eventId) {
            onReplyClick(eventId);
          }
        }}
        className="flex items-center gap-1.5 sm:gap-2 pl-4 sm:pl-6 ml-1 sm:ml-2 cursor-pointer group/reply min-w-0"
        title="Jump to original message"
      >
        <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-[#5865f2] text-white font-bold flex items-center justify-center text-[8px] sm:text-[9px] shrink-0">
          {displayUser.replace('@', '').slice(0, 1).toUpperCase()}
        </div>
        <span className="text-xs sm:text-sm text-[#f2f3f5] font-semibold group-hover/reply:underline truncate max-w-[100px] sm:max-w-[120px]">
          {displayUser}
        </span>
        <span className="text-xs sm:text-sm text-[#b5bac1] truncate max-w-[180px] sm:max-w-md">
          {displayText}
        </span>
      </div>
    </div>
  );
};
