import { createHash } from 'node:crypto';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getPlayer } from './musicActions.js';

const KEY_PREFIX = (userId) => `temp:music:library:${userId}:`;

function assertPersistentStorage(client) {
    const status = client.db?.getStatus?.();
    if (!status || status.isDegraded || status.connectionType !== 'postgresql') {
        throw new TitanBotError('Persistent library unavailable', ErrorTypes.CONFIGURATION, 'Your music library needs the persistent PostgreSQL database. The bot is currently using temporary storage, so saving favorites would not survive a restart. Please ask the bot owner to restore the database connection.');
    }
}

function normalizeTrack(track) {
    const info = track?.info || track || {};
    const title = String(info.title || '').trim();
    const author = String(info.author || 'Unknown artist').trim();
    const uri = typeof info.uri === 'string' ? info.uri : null;
    if (!title) {
        throw new TitanBotError('Invalid track', ErrorTypes.USER_INPUT, 'I could not identify that track. Try another search.');
    }
    return {
        title: title.slice(0, 300),
        author: author.slice(0, 200),
        uri,
        identifier: info.identifier || null,
        sourceName: info.sourceName || null,
        artworkUrl: info.artworkUrl || info.thumbnail || null,
        length: Number.isFinite(Number(info.length)) ? Number(info.length) : null,
    };
}

function makeTrackId(track) {
    const identity = track.uri || `${track.title.toLowerCase()}\u0000${track.author.toLowerCase()}`;
    return createHash('sha256').update(identity).digest('hex').slice(0, 32);
}

function getTrackNumberedList(items, offset = 0) {
    return items.map((item, index) => ({ number: offset + index + 1, ...item }));
}

export async function resolveTrackForLibrary(client, interaction, query) {
    if (!client.riffy) {
        throw new TitanBotError('Music unavailable', ErrorTypes.CONFIGURATION, 'Music is not configured right now.');
    }
    const result = await client.riffy.resolve({ query, requester: interaction.user });
    const tracks = result?.tracks || [];
    if (!tracks.length || !['search', 'track', 'SEARCH_RESULT', 'TRACK_LOADED'].includes(result.loadType)) {
        throw new TitanBotError('No track found', ErrorTypes.USER_INPUT, 'I could not find a single playable track for that search.');
    }
    return normalizeTrack(tracks[0]);
}

export async function saveLibraryTrack(client, userId, rawTrack) {
    assertPersistentStorage(client);
    const track = normalizeTrack(rawTrack);
    const id = makeTrackId(track);
    const key = `${KEY_PREFIX(userId)}${id}`;
    const existing = await client.db.get(key, null);
    if (existing) return { saved: false, track: existing };
    const record = { ...track, id, savedAt: new Date().toISOString() };
    const ok = await client.db.set(key, record);
    if (ok === false) {
        throw new TitanBotError('Library save failed', ErrorTypes.CONFIGURATION, 'I could not save this song. Check that the persistent database is available.');
    }
    return { saved: true, track: record };
}

export async function getLibraryTracks(client, userId) {
    assertPersistentStorage(client);
    const keys = await client.db.list(KEY_PREFIX(userId));
    const records = await Promise.all((keys || []).map((key) => client.db.get(key, null)));
    return records.filter((item) => item && item.id && item.title)
        .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

export async function removeLibraryTrack(client, userId, oneBasedIndex) {
    assertPersistentStorage(client);
    const tracks = await getLibraryTracks(client, userId);
    const track = tracks[oneBasedIndex - 1];
    if (!track) return null;
    await client.db.delete(`${KEY_PREFIX(userId)}${track.id}`);
    return track;
}

export async function clearLibrary(client, userId) {
    assertPersistentStorage(client);
    const keys = await client.db.list(KEY_PREFIX(userId));
    let deleted = 0;
    for (const key of keys || []) {
        const ok = await client.db.delete(key);
        if (ok !== false) deleted += 1;
    }
    return deleted;
}

export function getCurrentTrackForLibrary(client, guildId) {
    const player = getPlayer(client, guildId);
    if (!player?.current) {
        throw new TitanBotError('Nothing playing', ErrorTypes.USER_INPUT, 'There is no song playing right now. Use `/library save query:<song>` or start a song first.');
    }
    return normalizeTrack(player.current);
}

export function getLibraryPage(tracks, page = 1, pageSize = 10) {
    const totalPages = Math.max(1, Math.ceil(tracks.length / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    return { items: getTrackNumberedList(tracks.slice(start, start + pageSize).map((track) => ({ ...track })), start), page: safePage, totalPages, total: tracks.length };
}
